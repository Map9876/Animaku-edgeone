import type { Context } from 'hono'
import { getClientIp } from './logger'
import {
  checkSourceRateLimit,
  SourceRateLimitError,
} from './source-rate-limit'
import {
  cacheDelete,
  cacheGet,
  cacheGetOrSet,
  wantsCacheBypass,
} from './ttl-cache'

export const DANMAKU_BYPASS_COOLDOWN_MS = 30_000

// In-memory bypass cooldown record: cacheKey -> timestamp
const danmakuBypassCooldownMap = new Map<string, number>()

const danmakuCooldownPruneTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, timestamp] of danmakuBypassCooldownMap.entries()) {
    if (now - timestamp >= DANMAKU_BYPASS_COOLDOWN_MS) {
      danmakuBypassCooldownMap.delete(key)
    }
  }
}, DANMAKU_BYPASS_COOLDOWN_MS)
danmakuCooldownPruneTimer.unref?.()

export interface GuardedDanmakuOptions<T> {
  c: Context
  upstreamKey: 'dandan' | 'bilibili'
  cacheKey: string
  ttlMs: number
  keyPrefix?: string
  loader: () => Promise<T>
}

export interface GuardedDanmakuResult<T> {
  value: T
  hit: boolean
  bypassUsed: boolean
}

/**
 * 保护弹幕出站请求的核心调度器：
 * 1. 先查缓存：无 bypass 命中缓存直接返回，零网络消耗；
 * 2. 30 秒冷却防御：冷却期内静默忽略 bypass，直接返回缓存；
 * 3. 严格限频时序：只有在出站前先通过 checkSourceRateLimit，才允许消耗冷却和清理旧缓存；
 * 4. 429 拦截保护：限频超限时旧缓存完整保留，绝不提前 cacheDelete 导致穿透放大。
 */
export async function fetchDanmakuWithGuard<T>(
  options: GuardedDanmakuOptions<T>,
): Promise<GuardedDanmakuResult<T>> {
  const { c, upstreamKey, cacheKey, ttlMs, keyPrefix, loader } = options
  const wantsBypass = wantsCacheBypass(c)
  const clientIp = getClientIp(c.req)

  // 1. 尝试读现有缓存
  const cached = cacheGet<T>(cacheKey)

  // 2. 客户端显式请求 bypass (refresh=1)
  if (wantsBypass) {
    const now = Date.now()
    const lastBypass = danmakuBypassCooldownMap.get(cacheKey) || 0

    // 2.1 30 秒冷却期内：静默忽略 bypass，走现有缓存
    if (cached !== undefined && now - lastBypass < DANMAKU_BYPASS_COOLDOWN_MS) {
      return { value: cached, hit: true, bypassUsed: false }
    }

    // 2.2 冷却通过，即将真正打到上游：【先检查限流】！
    const rateLimit = checkSourceRateLimit(clientIp, upstreamKey, 'danmaku')
    if (!rateLimit.allowed) {
      throw new SourceRateLimitError({
        retryAfterSec: rateLimit.retryAfterSec,
        limit: rateLimit.limit,
        kind: 'danmaku',
        upstreamKey,
      })
    }

    // 2.3 限流通过后：才记录冷却并删除旧缓存
    danmakuBypassCooldownMap.set(cacheKey, now)
    cacheDelete(cacheKey)
  } else {
    // 3. 不带 bypass：若命中缓存，直接返回
    if (cached !== undefined) {
      return { value: cached, hit: true, bypassUsed: false }
    }

    // 4. 缓存未命中 (MISS)：即将真正打到上游，【先检查限流】！
    const rateLimit = checkSourceRateLimit(clientIp, upstreamKey, 'danmaku')
    if (!rateLimit.allowed) {
      throw new SourceRateLimitError({
        retryAfterSec: rateLimit.retryAfterSec,
        limit: rateLimit.limit,
        kind: 'danmaku',
        upstreamKey,
      })
    }
  }

  // 5. 安全执行 loader 并写入缓存
  const { value, hit } = await cacheGetOrSet(
    cacheKey,
    ttlMs,
    loader,
    { bypass: false, keyPrefix },
  )

  return { value, hit, bypassUsed: wantsBypass }
}

/** 仅供单元测试重置状态 */
export function clearDanmakuBypassCooldowns(): void {
  danmakuBypassCooldownMap.clear()
}
