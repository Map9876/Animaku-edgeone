import { useEffect, useRef, useState, useCallback } from 'react'
import {
  type PluginMeta,
  type SearchItem,
  type WeightContext,
  getPluginTotalWeight,
} from '@animaku/shared'
import type { AggregatedSourceState } from '../../lib/use-source-aggregator'

export interface AutoSourcePickDecision {
  action: 'none' | 'immediate' | 'wait_grace'
  candidate?: AggregatedSourceState
  higherPriorityInFlight?: string[]
}

/** 计算插件在用户优先级列表中的排名（保留向后兼容） */
export function getPluginRank(pluginName: string, pluginOrder: string[]): number {
  const idx = pluginOrder.findIndex(
    (n) => n.toLowerCase() === pluginName.toLowerCase(),
  )
  return idx >= 0 ? idx : pluginOrder.length + 999
}

/**
 * 纯函数裁决逻辑（可独立单测）：
 * 在当前 ready 的候选源中找出按总分（Total Effective Weight）最优解，
 * 并结合当前正在 probing/排队中的源做出裁决：
 * 1. 无 ready 候选 -> 'none'
 * 2. 有 ready 候选，且无更高优先级的源在排队/探测中 -> 'immediate' (0ms 秒提)
 * 3. 有 ready 候选，但有更高优先级的源在排队/探测中 -> 'wait_grace' (需进入自适应宽限窗口)
 */
export function resolveAutoSourceDecision(
  sources: Record<string, AggregatedSourceState>,
  inFlightPlugins: string[],
  pluginOrder?: string[],
  boostedPluginNames?: Set<string>,
  weightContext?: WeightContext,
): AutoSourcePickDecision {
  const readyCandidates = Object.values(sources).filter(
    (s) => s.status === 'ready' && s.matchedItem && s.plugin,
  )

  if (readyCandidates.length === 0) {
    return { action: 'none' }
  }

  const ctx: WeightContext = {
    boostedPluginNames,
    ...(weightContext || {}),
  }

  // 按总有效权重从高到低排序，同分字母序
  readyCandidates.sort((a, b) => {
    const wa = getPluginTotalWeight(a.plugin, ctx)
    const wb = getPluginTotalWeight(b.plugin, ctx)
    if (wa !== wb) return wb - wa
    return a.plugin.name.localeCompare(b.plugin.name)
  })

  const bestCandidate = readyCandidates[0]
  const bestWeight = getPluginTotalWeight(bestCandidate.plugin, ctx)

  // 检查在 flight 中是否有优先级高于 bestCandidate 的源
  const higherPriorityInFlight = inFlightPlugins.filter((name) => {
    if (name.toLowerCase() === bestCandidate.plugin.name.toLowerCase()) return false
    const inFlightPlugin = sources[name]?.plugin
    if (!inFlightPlugin) return false
    const weight = getPluginTotalWeight(inFlightPlugin, ctx)
    return weight > bestWeight
  })

  if (higherPriorityInFlight.length === 0) {
    return {
      action: 'immediate',
      candidate: bestCandidate,
    }
  }

  return {
    action: 'wait_grace',
    candidate: bestCandidate,
    higherPriorityInFlight,
  }
}

export interface UseAutoSourcePickOptions {
  bangumiId: number
  enabled: boolean
  sources: Record<string, AggregatedSourceState>
  pluginOrder?: string[]
  inFlightPlugins: string[]
  boostedPluginNames?: Set<string>
  weightContext?: WeightContext
  allFallbacksExhausted?: boolean
  onSwitchSource: (
    plugin: PluginMeta,
    targetItem?: SearchItem,
    opts?: { autoFallback?: boolean },
  ) => void
  onAllFallbacksFailed?: () => void
  gracePeriodMs?: number
}

export function useAutoSourcePick({
  bangumiId,
  enabled,
  sources,
  pluginOrder = [],
  inFlightPlugins,
  boostedPluginNames,
  weightContext,
  allFallbacksExhausted = false,
  onSwitchSource,
  onAllFallbacksFailed,
  gracePeriodMs = 1200,
}: UseAutoSourcePickOptions) {
  const userLockedRef = useRef(false)
  const autoPickedRef = useRef(false)
  const allFallbacksTriggeredRef = useRef(false)
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevBangumiIdRef = useRef(bangumiId)
  const [pendingCandidateName, setPendingCandidateName] = useState<string | null>(null)

  // 番剧切换时重置所有锁与定时器
  if (prevBangumiIdRef.current !== bangumiId) {
    prevBangumiIdRef.current = bangumiId
    userLockedRef.current = false
    autoPickedRef.current = false
    allFallbacksTriggeredRef.current = false
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
    setPendingCandidateName(null)
  }

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current)
      graceTimerRef.current = null
    }
  }, [])

  // 用户操作互斥锁：用户手动点击任意源或操作关键词时，立即永久废除当次自动切源
  const onUserAction = useCallback(() => {
    userLockedRef.current = true
    clearGraceTimer()
    setPendingCandidateName(null)
  }, [clearGraceTimer])

  useEffect(() => {
    return () => {
      clearGraceTimer()
    }
  }, [clearGraceTimer])

  useEffect(() => {
    // 未开启（非默认源失败场景）或用户已手动操作或已自动选过源，不执行
    if (!enabled || userLockedRef.current || autoPickedRef.current) {
      clearGraceTimer()
      setPendingCandidateName(null)
      return
    }

    const decision = resolveAutoSourceDecision(
      sources,
      inFlightPlugins,
      pluginOrder,
      boostedPluginNames,
      weightContext,
    )

    if (decision.action === 'none') {
      clearGraceTimer()
      setPendingCandidateName(null)
      if (
        allFallbacksExhausted &&
        !autoPickedRef.current &&
        !userLockedRef.current &&
        !allFallbacksTriggeredRef.current
      ) {
        allFallbacksTriggeredRef.current = true
        onAllFallbacksFailed?.()
      }
      return
    }

    const candidate = decision.candidate!

    // Case 1: 0ms 秒提（无更高优先级源在探测）
    if (decision.action === 'immediate') {
      clearGraceTimer()
      setPendingCandidateName(null)
      autoPickedRef.current = true
      onSwitchSource(candidate.plugin, candidate.matchedItem, { autoFallback: true })
      return
    }

    // Case 2: 存在更高优先级源在探测，进入自适应宽限
    setPendingCandidateName(candidate.plugin.name)

    if (!graceTimerRef.current) {
      graceTimerRef.current = setTimeout(() => {
        if (userLockedRef.current || autoPickedRef.current) return
        autoPickedRef.current = true
        clearGraceTimer()
        setPendingCandidateName(null)
        onSwitchSource(candidate.plugin, candidate.matchedItem, { autoFallback: true })
      }, gracePeriodMs)
    }
  }, [
    enabled,
    sources,
    inFlightPlugins,
    pluginOrder,
    boostedPluginNames,
    weightContext,
    allFallbacksExhausted,
    onAllFallbacksFailed,
    gracePeriodMs,
    onSwitchSource,
    clearGraceTimer,
  ])

  return {
    onUserAction,
    pendingCandidateName,
  }
}
