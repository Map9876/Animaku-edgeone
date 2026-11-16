import { useQuery } from '@tanstack/react-query'
import { statsApi } from '../../lib/api'

export function NavOnlineBadge() {
  const { data: onlineData } = useQuery({
    queryKey: ['stats-online'],
    queryFn: ({ signal }) => statsApi.getOnlineUsers({ signal }),
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const onlineCount = onlineData?.online

  if (typeof onlineCount !== 'number' || onlineCount <= 0) {
    return null
  }

  return (
    <div
      className="hidden md:inline-flex shrink-0 items-center gap-1.5 h-8.5 sm:h-9.5 px-3 rounded-full border border-[var(--kz-border)] bg-[var(--kz-bg-soft)]/70 text-[12px] font-medium text-[var(--kz-fg-muted)] shadow-2xs backdrop-blur-sm select-none transition-colors hover:border-[var(--kz-border-subtle)] hover:bg-[var(--kz-bg-elevated)]"
      title={`当前实时在线用户: ${onlineCount}`}
      aria-label={`当前在线 ${onlineCount} 人`}
    >
      {/* 柔和呼吸绿点 */}
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span>在线</span>
      <span className="font-semibold text-pink-500 dark:text-pink-400 tabular-nums">
        {onlineCount}
      </span>
    </div>
  )
}
