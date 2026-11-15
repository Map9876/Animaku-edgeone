import { memo, useMemo } from 'react'
import clsx from 'clsx'

export interface KzPaginationProps {
  page: number
  pageSize?: number
  total?: number
  totalPages?: number
  disabled?: boolean
  className?: string
  onPageChange: (page: number) => void
}

/**
 * 💡 严格遵循 B 站 Web 端 vui_pagenation 翻页算法：
 * - 当总页数 <= 8：完整展开 1..totalPages，不使用省略号；
 * - 当当前页靠前 (<= 5)：展示 1..7，紧跟省略号 ... 与最后一页 totalPages；
 * - 当当前页靠后 (>= totalPages - 4)：展示第 1 页、省略号 ... 与最后 7 页 (totalPages-6..totalPages)；
 * - 当当前页居中：展示第 1 页、省略号 ...、[page-2, page-1, page, page+1, page+2]、省略号 ...、最后一页 totalPages。
 */
export function computeBiliPagination(page: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  if (page <= 5) {
    const list: (number | 'ellipsis')[] = []
    for (let i = 1; i <= 7; i++) {
      list.push(i)
    }
    list.push('ellipsis', totalPages)
    return list
  }

  if (page >= totalPages - 4) {
    const list: (number | 'ellipsis')[] = [1, 'ellipsis']
    for (let i = totalPages - 6; i <= totalPages; i++) {
      list.push(i)
    }
    return list
  }

  return [1, 'ellipsis', page - 2, page - 1, page, page + 1, page + 2, 'ellipsis', totalPages]
}

export const KzPagination = memo(function KzPagination({
  page,
  pageSize,
  total,
  totalPages: propTotalPages,
  disabled = false,
  className,
  onPageChange,
}: KzPaginationProps) {
  const calculatedTotalPages =
    propTotalPages ??
    (total != null && pageSize != null ? Math.max(1, Math.ceil(total / pageSize)) : 1)
  const totalPages = Math.max(1, calculatedTotalPages)

  const pages = useMemo(
    () => computeBiliPagination(page, totalPages),
    [page, totalPages],
  )

  if (totalPages <= 1) return null

  return (
    <div className={clsx('flex items-center justify-center select-none overflow-x-auto max-w-full py-1', className)}>
      <div className="vui_pagenation" role="navigation" aria-label="分页">
        <div className="vui_pagenation--btns">
          <button
            type="button"
            disabled={page <= 1 || disabled}
            onClick={() => onPageChange(page - 1)}
            className="vui_button vui_pagenation--btn vui_pagenation--btn-side"
            aria-label="上一页"
          >
            上一页
          </button>

          {pages.map((p, idx) => {
            if (p === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="vui_pagenation--extend"
                  aria-hidden="true"
                >
                  ...
                </span>
              )
            }

            const isActive = p === page
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => onPageChange(p)}
                className={clsx(
                  'vui_button vui_button--no-transition vui_pagenation--btn vui_pagenation--btn-num',
                  isActive && 'vui_button--active vui_button--active-blue',
                )}
                aria-label={isActive ? `第 ${p} 页，当前页` : `第 ${p} 页`}
                aria-current={isActive ? 'page' : undefined}
              >
                {p}
              </button>
            )
          })}

          <button
            type="button"
            disabled={page >= totalPages || disabled}
            onClick={() => onPageChange(page + 1)}
            className="vui_button vui_pagenation--btn vui_pagenation--btn-side"
            aria-label="下一页"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  )
})
