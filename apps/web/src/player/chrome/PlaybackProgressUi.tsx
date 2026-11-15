import { memo, useId, useMemo } from 'react'
import type { DanmakuComment } from '@animaku/shared'
import { formatTime } from '../media/format'
import {
  usePlayerProgress,
  usePlayerTime,
} from '../timeStore'
import { perfMetrics } from '../../lib/performance-metrics'

export interface PlayerTimeDisplayProps {
  staticDuration?: number
}

/**
 * 局部订阅时间戳组件（用于 01:23 / 24:00 时间显示）
 * 仅当 current 或 duration 改变时局部重渲染，完全切断对外层控制栏的污染
 */
export const PlayerTimeDisplay = memo(function PlayerTimeDisplay({
  staticDuration,
}: PlayerTimeDisplayProps) {
  const { current, duration } = usePlayerTime()
  const d = staticDuration ?? duration

  return (
    <span className="kz-time">
      {formatTime(current)} / {formatTime(d)}
    </span>
  )
})

export interface PlayerSeekRangeProps {
  dragRatio: number | null
  onSeekRatio: (ratio: number) => void
}

/**
 * 局部订阅进度滑块组件（用于 kz-seek 与 CSS --kz-progress 进度条样式）
 * 仅当 progress 百分比改变时局部重渲染，彻底阻断每秒 4 次向 Controls 树扩散
 */
export const PlayerSeekRange = memo(function PlayerSeekRange({
  dragRatio,
}: PlayerSeekRangeProps) {
  perfMetrics.recordProgressRender()
  const progress = usePlayerProgress()
  const effectiveProgress = dragRatio !== null ? dragRatio * 100 : progress

  return (
    <div
      className="kz-seek"
      style={{ ['--kz-progress' as string]: `${effectiveProgress}%` }}
      aria-label="进度"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(effectiveProgress)}
    >
      <div className="kz-seek-track">
        <div
          className="kz-seek-played"
          style={{ width: `${effectiveProgress}%` }}
        />
      </div>
      <div
        className="kz-seek-thumb"
        style={{ left: `${effectiveProgress}%` }}
      />
    </div>
  )
})

/**
 * 计算弹幕热力图 SVG 波浪曲线路径（三阶贝塞尔平滑曲线）
 */
export function computeDanmakuHeatmap(
  comments: DanmakuComment[] | undefined,
  duration: number,
  numBuckets = 60,
  height = 24,
): string | null {
  if (!comments || comments.length < 5 || duration <= 0) return null
  const buckets = new Array(numBuckets).fill(0)
  for (const c of comments) {
    if (c.time >= 0 && c.time <= duration) {
      const idx = Math.min(
        numBuckets - 1,
        Math.floor((c.time / duration) * numBuckets),
      )
      buckets[idx]++
    }
  }
  const max = Math.max(...buckets)
  if (max <= 1) return null

  // 3-point moving average smoothing
  const smoothed = buckets.map((val, i) => {
    const prev = buckets[i - 1] ?? val
    const next = buckets[i + 1] ?? val
    return (prev + val * 2 + next) / 4
  })
  const smoothedMax = Math.max(...smoothed) || 1

  const points: { x: number; y: number }[] = []
  for (let i = 0; i < numBuckets; i++) {
    const x = (i / (numBuckets - 1)) * 100
    const normalized = smoothed[i] / smoothedMax
    // 顶部留出 3px 安全边距，波谷底线保持在 height
    const y = height - Math.pow(normalized, 0.75) * (height - 3)
    points.push({ x, y })
  }

  // 构造三阶贝塞尔平滑曲线（Catmull-Rom to Cubic Bezier），使波峰波谷圆润高级
  let path = `M 0 ${height} L ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 2] ?? points[i - 1]
    const p1 = points[i - 1]
    const p2 = points[i]
    const p3 = points[i + 1] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = Math.min(height, Math.max(0, p1.y + (p2.y - p0.y) / 6))
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = Math.min(height, Math.max(0, p2.y - (p3.y - p1.y) / 6))

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  path += ` L 100 ${height} Z`
  return path
}

export interface PlayerDanmakuHeatmapProps {
  comments?: DanmakuComment[]
  duration: number
  height?: number
  numBuckets?: number
  idPrefix?: string
  dragRatio?: number | null
}

/**
 * 局部订阅弹幕热力图组件（B 站风格双色注入波浪，跟随播放进度实时注满点亮）
 */
export const PlayerDanmakuHeatmap = memo(function PlayerDanmakuHeatmap({
  comments,
  duration,
  height = 24,
  numBuckets = 60,
  idPrefix,
  dragRatio,
}: PlayerDanmakuHeatmapProps) {
  const autoId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const curveClipId = idPrefix ? `${idPrefix}-curve` : `kz-hm-curve-${autoId}`
  const unplayedGradId = idPrefix ? `${idPrefix}-unplayed` : `kz-hm-unplayed-${autoId}`
  const playedGradId = idPrefix ? `${idPrefix}-played` : `kz-hm-played-${autoId}`

  const progress = usePlayerProgress()
  const effectiveProgress =
    dragRatio !== null && dragRatio !== undefined ? dragRatio * 100 : progress

  const heatmapPath = useMemo(
    () => computeDanmakuHeatmap(comments, duration, numBuckets, height),
    [comments, duration, numBuckets, height],
  )

  if (!heatmapPath || duration <= 0) return null

  return (
    <svg
      className="kz-seek-heatmap"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={curveClipId}>
          <path d={heatmapPath} />
        </clipPath>
        {/* 未播放部分：柔和白色半透明垂直渐变 */}
        <linearGradient id={unplayedGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.35)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.08)" />
        </linearGradient>
        {/* 已播放部分：主题青蓝色高亮垂直渐变 */}
        <linearGradient id={playedGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.7)" />
          <stop offset="100%" stopColor="rgba(56, 189, 248, 0.18)" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${curveClipId})`}>
        {/* 未播放底层波浪 */}
        <rect
          x="0"
          y="0"
          width="100"
          height={height}
          fill={`url(#${unplayedGradId})`}
        />
        {/* 已播放高亮波浪（随播放进度或拖拽实时延展推进） */}
        {effectiveProgress > 0 && (
          <rect
            x="0"
            y="0"
            width={effectiveProgress}
            height={height}
            fill={`url(#${playedGradId})`}
          />
        )}
        {/* 播放位置垂直微光线 */}
        {effectiveProgress > 0 && effectiveProgress < 100 && (
          <line
            x1={effectiveProgress}
            x2={effectiveProgress}
            y1="0"
            y2={height}
            stroke="rgba(255, 255, 255, 0.6)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </g>
    </svg>
  )
})

