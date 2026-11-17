import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueries, keepPreviousData } from '@tanstack/react-query'
import { bangumiImageUrl, coverOf, type BangumiItem } from '@animaku/shared'
import { statsApi } from '../../lib/api'
import { bangumiApi } from '../../lib/bangumi'
import { useSettingsStore } from '../../stores/settings'

const LEADERBOARD_LIMIT = 3
const RANKING_STALE_TIME = 30 * 60_000 // 30 分钟缓存
const RANKING_GC_TIME = 60 * 60_000

type DynamicRankTab = 'today' | 'week' | 'month'

const TAB_LABELS: Record<DynamicRankTab, string> = {
  today: '日榜',
  week: '周榜',
  month: '月榜',
}

function formatPlayCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  return String(Math.round(count))
}

function formatCompactPlayCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1).replace(/\.0$/, '')}万`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(Math.round(count))
}

const RANK_COLORS: Record<number, string> = {
  1: 'text-amber-300', // 金
  2: 'text-slate-200', // 银
  3: 'text-orange-400', // 铜
}

interface LeaderboardPosterCardProps {
  rank: number
  bangumiId: number
  totalPlayCount: number
  subject?: BangumiItem
  openInNewTab?: boolean
}

function LeaderboardPosterCard({
  rank,
  bangumiId,
  totalPlayCount,
  subject,
  openInNewTab,
}: LeaderboardPosterCardProps) {
  const title = subject?.nameCn || subject?.name || `番剧 #${bangumiId}`
  const coverUrl = subject ? coverOf(subject) : undefined
  const rankColor = RANK_COLORS[rank] || 'text-white'

  return (
    <Link
      to={`/subject/${bangumiId}`}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[var(--kz-bg-soft)] ring-1 ring-[var(--kz-border)] shadow-[0_8px_20px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition-all duration-300 hover:ring-[var(--kz-accent)]/60 hover:shadow-md [isolation:isolate] [transform:translateZ(0)]"
    >
      {/* 封面图片 */}
      {coverUrl ? (
        <img
          src={bangumiImageUrl(coverUrl)}
          alt={title}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--kz-bg-soft)] text-xs text-[var(--kz-fg-muted)]">
          加载中…
        </div>
      )}

      {/* 右上角观看数：樱花粉色；手机端紧凑单位 (如 5.6万 人看过)，桌面端显示完整 */}
      <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center text-pink-200 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
        <span className="text-[11.5px] sm:text-[12.5px] font-medium tabular-nums leading-none">
          <span className="sm:hidden">{formatCompactPlayCount(totalPlayCount)} 人看过</span>
          <span className="hidden sm:inline">{formatPlayCount(totalPlayCount)} 人看过</span>
        </span>
      </div>

      {/* 底部暗色渐变遮罩：确保标题与排名清晰易读 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/90 via-black/45 to-transparent"
        aria-hidden
      />

      {/* 底部信息栏：左下角标题（自动截断省略绝不覆盖）+ 右下角金银铜大序号 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-baseline justify-between gap-1.5 px-2.5 pb-2">
        <span
          className="min-w-0 flex-1 truncate text-[12.5px] sm:text-[13.5px] font-medium text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
          title={title}
        >
          {title}
        </span>
        <span
          className={`shrink-0 text-xl sm:text-2xl font-black italic tracking-tighter tabular-nums leading-none [text-shadow:0_2px_4px_rgba(0,0,0,0.95)] ${rankColor}`}
        >
          {rank}
        </span>
      </div>
    </Link>
  )
}

function LeaderboardSkeletonCard(_props?: { rank?: number }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[var(--kz-bg-soft)] ring-1 ring-[var(--kz-border)] animate-pulse pointer-events-none" />
  )
}

export function HomeLeaderboards() {
  const openInNewTab = useSettingsStore((s) => s.nav.openInNewTab)
  const [activeTab, setActiveTab] = useState<DynamicRankTab>('today')

  // 1. 在线活跃用户查询 (1 分钟刷新一次)
  const onlineQuery = useQuery({
    queryKey: ['stats-online'],
    queryFn: ({ signal }) => statsApi.getOnlineUsers({ signal }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  // 2. 动态榜单 (日 / 周 / 月)
  const dynamicRankQuery = useQuery({
    queryKey: ['stats-rank', activeTab, LEADERBOARD_LIMIT],
    queryFn: () => statsApi.getRankings(activeTab, LEADERBOARD_LIMIT),
    staleTime: RANKING_STALE_TIME,
    gcTime: RANKING_GC_TIME,
    placeholderData: keepPreviousData,
  })

  // 3. 观看总榜 (历史全量)
  const totalRankQuery = useQuery({
    queryKey: ['stats-rank', 'total', LEADERBOARD_LIMIT],
    queryFn: () => statsApi.getRankings('total', LEADERBOARD_LIMIT),
    staleTime: RANKING_STALE_TIME,
    gcTime: RANKING_GC_TIME,
    placeholderData: keepPreviousData,
  })

  const dynamicItems = useMemo(
    () => dynamicRankQuery.data?.data ?? [],
    [dynamicRankQuery.data?.data],
  )
  const totalItems = useMemo(
    () => totalRankQuery.data?.data ?? [],
    [totalRankQuery.data?.data],
  )

  // 收集所有需要回查标题与封面的 bangumiId
  const allBangumiIds = useMemo(() => {
    const set = new Set<number>()
    for (const item of dynamicItems) {
      if (item.bangumiId > 0) set.add(item.bangumiId)
    }
    for (const item of totalItems) {
      if (item.bangumiId > 0) set.add(item.bangumiId)
    }
    return Array.from(set)
  }, [dynamicItems, totalItems])

  // 4. 并行利用 React Query 补全番剧元数据 (共享全站 subject 缓存)
  const subjectQueries = useQueries({
    queries: allBangumiIds.map((id) => ({
      queryKey: ['subject', id],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        bangumiApi.subject(id, { signal }),
      staleTime: 24 * 60 * 60_000,
      gcTime: 48 * 60 * 60_000,
      enabled: id > 0,
    })),
  })

  const subjectMap = useMemo(() => {
    const map = new Map<number, BangumiItem>()
    allBangumiIds.forEach((id, index) => {
      const data = subjectQueries[index]?.data?.data
      if (data) {
        map.set(id, data)
      }
    })
    return map
  }, [allBangumiIds, subjectQueries])

  // 5. 零数据隐形防御：如果两个榜单皆无数据，彻底静默不渲染
  const hasDynamicData = dynamicItems.length > 0
  const hasTotalData = totalItems.length > 0

  if (!hasDynamicData && !hasTotalData && !dynamicRankQuery.isLoading && !totalRankQuery.isLoading) {
    return null
  }

  const onlineCount = onlineQuery.data?.online

  return (
    <section aria-label="观看排行榜" className="space-y-4">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="kz-section-title font-black">排行榜</h2>
      </div>

      {/* 左右双栏结构 (桌面端 2 大卡片并排，移动端上下折叠) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 左模块：观看排行榜 */}
        <div className="kz-surface flex flex-col overflow-hidden rounded-2xl border border-[var(--kz-border)]/60 p-4 shadow-xs">
          {/* 1. 小标题与卡片头部 */}
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-[var(--kz-fg)]">
              观看排行
            </span>
            {/* 日 / 周 / 月 Tab 切换：方案 1 樱花粉活力胶囊 */}
            <div className="flex items-center rounded-full bg-[var(--kz-bg-soft)] p-0.5 text-[11.5px] ring-1 ring-[var(--kz-border)]/50">
              {(['today', 'week', 'month'] as const).map((tab) => {
                const isActive = activeTab === tab
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`w-10 text-center rounded-full py-0.5 transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-pink-500/15 dark:bg-pink-500/25 font-bold text-pink-600 dark:text-pink-300 shadow-2xs'
                        : 'font-medium text-[var(--kz-fg-muted)] hover:text-pink-500/80 dark:hover:text-pink-300/80'
                    }`}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3 张海报横向等宽铺满 */}
          {dynamicItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {dynamicItems.slice(0, LEADERBOARD_LIMIT).map((item, idx) => (
                <LeaderboardPosterCard
                  key={`${activeTab}-${item.bangumiId}`}
                  rank={idx + 1}
                  bangumiId={item.bangumiId}
                  totalPlayCount={item.totalPlayCount}
                  subject={subjectMap.get(item.bangumiId)}
                  openInNewTab={openInNewTab}
                />
              ))}
            </div>
          ) : dynamicRankQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((r) => (
                <LeaderboardSkeletonCard key={r} rank={r} />
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-8 text-xs text-[var(--kz-fg-muted)]">
              暂无排行数据
            </div>
          )}
        </div>

        {/* 右模块：观看总榜 */}
        <div className="kz-surface flex flex-col overflow-hidden rounded-2xl border border-[var(--kz-border)]/60 p-4 shadow-xs">
          {/* 卡片头部：左侧标题，右侧樱花粉在线用户胶囊 */}
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-[var(--kz-fg)]">
              观看总榜
            </span>
            {typeof onlineCount === 'number' && onlineCount > 0 && (
              <div className="flex items-center rounded-full bg-[var(--kz-bg-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--kz-fg-muted)] ring-1 ring-[var(--kz-border)]/50 shadow-2xs">
                <span>在线用户</span>
                <span className="ml-1.5 font-semibold text-pink-500 dark:text-pink-300 tabular-nums">
                  {onlineCount}
                </span>
              </div>
            )}
          </div>

          {/* 3 张海报横向等宽铺满 */}
          {totalItems.length > 0 ? (
            <div className="grid grid-cols-3 gap-3">
              {totalItems.slice(0, LEADERBOARD_LIMIT).map((item, idx) => (
                <LeaderboardPosterCard
                  key={`total-${item.bangumiId}`}
                  rank={idx + 1}
                  bangumiId={item.bangumiId}
                  totalPlayCount={item.totalPlayCount}
                  subject={subjectMap.get(item.bangumiId)}
                  openInNewTab={openInNewTab}
                />
              ))}
            </div>
          ) : totalRankQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((r) => (
                <LeaderboardSkeletonCard key={r} rank={r} />
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-8 text-xs text-[var(--kz-fg-muted)]">
              暂无排行数据
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
