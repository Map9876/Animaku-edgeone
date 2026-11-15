import { memo } from 'react'
import { KzPagination } from '../../../components/ui'

export interface CommentPaginationProps {
  page: number
  pageSize: number
  total: number
  loading?: boolean
  onPageChange: (page: number) => void
}

export const CommentPagination = memo(function CommentPagination({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
}: CommentPaginationProps) {
  return (
    <KzPagination
      page={page}
      pageSize={pageSize}
      total={total}
      disabled={loading}
      onPageChange={onPageChange}
      className="pt-2"
    />
  )
})

