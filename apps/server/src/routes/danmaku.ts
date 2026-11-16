import { Hono } from 'hono'
import { parseDanmakuComments } from '@animaku/shared'
import { dandanGet, isDanmakuUsingFallback } from '../lib/dandan'
import { setDanmakuCdnHeaders } from '../lib/cdn-cache-headers'
import { fetchDanmakuWithGuard } from '../lib/danmaku-guard'
import { SourceRateLimitError } from '../lib/source-rate-limit'

export const danmakuRoutes = new Hono()

const DANMAKU_CACHE_TTL = {
  /** Anime subject metadata & episode list (12 hours) */
  subject: 12 * 60 * 60_000,
  /** Anime search results (2 hours) */
  search: 2 * 60 * 60_000,
  /** Episode comments (30 minutes) */
  comments: 30 * 60_000,
} as const

danmakuRoutes.get('/status', (c) =>
  c.json({
    // Always usable: user open-platform keys or agefans-compatible fallback
    configured: true,
    usingFallback: isDanmakuUsingFallback(),
  }),
)

danmakuRoutes.get('/search', async (c) => {
  const keyword = (c.req.query('keyword') || '').trim()
  if (!keyword) return c.json({ error: 'bad_request', message: '缺少 keyword' }, 400)
  const cacheKey = `dandan:search:${keyword.toLowerCase()}`
  try {
    const { value: animes, hit, bypassUsed } = await fetchDanmakuWithGuard({
      c,
      upstreamKey: 'dandan',
      cacheKey,
      ttlMs: DANMAKU_CACHE_TTL.search,
      keyPrefix: 'dandan:',
      loader: async () => {
        const json = (await dandanGet('/api/v2/search/anime', { keyword })) as {
          success?: boolean
          errorMessage?: string
          animes?: Array<Record<string, unknown>>
        }
        if (json.success === false) {
          throw new Error(json.errorMessage || '弹弹搜索失败')
        }
        return (json.animes || []).map((o) => ({
          animeId: Number(o.animeId),
          animeTitle: String(o.animeTitle ?? ''),
          bangumiId: o.bangumiId != null ? String(o.bangumiId) : undefined,
          episodeCount: o.episodeCount != null ? Number(o.episodeCount) : undefined,
          typeDescription:
            o.typeDescription != null ? String(o.typeDescription) : undefined,
          imageUrl: o.imageUrl != null ? String(o.imageUrl) : undefined,
        }))
      },
    })
    c.header('X-Cache', hit ? 'HIT' : 'MISS')
    setDanmakuCdnHeaders(c, bypassUsed)
    return c.json({ data: animes })
  } catch (e) {
    if (e instanceof SourceRateLimitError) {
      c.header('Retry-After', String(e.retryAfterSec))
      return c.json(
        { error: 'rate_limited', message: e.message, retryAfter: e.retryAfterSec },
        429,
      )
    }
    return c.json(
      { error: 'upstream', message: e instanceof Error ? e.message : String(e) },
      502,
    )
  }
})

danmakuRoutes.get('/bangumi/bgmtv/:bgmId', async (c) => {
  const bgmId = c.req.param('bgmId')
  if (!/^\d+$/.test(bgmId)) {
    return c.json({ error: 'bad_request', message: 'bgmId 必须为纯数字' }, 400)
  }
  const cacheKey = `dandan:bgmtv:${bgmId}`
  try {
    const { value: result, hit, bypassUsed } = await fetchDanmakuWithGuard({
      c,
      upstreamKey: 'dandan',
      cacheKey,
      ttlMs: DANMAKU_CACHE_TTL.subject,
      keyPrefix: 'dandan:',
      loader: async () => {
        const json = (await dandanGet(`/api/v2/bangumi/bgmtv/${bgmId}`)) as {
          success?: boolean
          errorCode?: number
          errorMessage?: string
          bangumi?: { animeId?: number; episodes?: Array<Record<string, unknown>> }
          bangumiId?: number
        }
        if (json.success === false) {
          // errorCode 7: 无法找到指定的资源（新番未收录/无映射正常情况，缓存空结果以保护配额并消除 502）
          if (json.errorCode === 7 || json.errorMessage?.includes('无法找到')) {
            return {
              bangumiId: 0,
              episodes: [],
            }
          }
          throw new Error(json.errorMessage || '弹弹 BGM 查询失败')
        }
        const bangumi = json.bangumi || json
        const episodes = (
          (bangumi as { episodes?: Array<Record<string, unknown>> }).episodes || []
        ).map((e) => ({
          episodeId: Number(e.episodeId),
          episodeTitle: String(e.episodeTitle ?? ''),
        }))
        return {
          bangumiId: Number(
            (bangumi as { animeId?: number }).animeId ??
              (bangumi as { bangumiId?: number }).bangumiId ??
              0,
          ),
          episodes,
        }
      },
    })
    c.header('X-Cache', hit ? 'HIT' : 'MISS')
    setDanmakuCdnHeaders(c, bypassUsed)
    return c.json({ data: result })
  } catch (e) {
    if (e instanceof SourceRateLimitError) {
      c.header('Retry-After', String(e.retryAfterSec))
      return c.json(
        { error: 'rate_limited', message: e.message, retryAfter: e.retryAfterSec },
        429,
      )
    }
    return c.json(
      { error: 'upstream', message: e instanceof Error ? e.message : String(e) },
      502,
    )
  }
})

danmakuRoutes.get('/bangumi/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^\d+$/.test(id)) {
    return c.json({ error: 'bad_request', message: 'id 必须为纯数字' }, 400)
  }
  const cacheKey = `dandan:bangumi:${id}`
  try {
    const { value: result, hit, bypassUsed } = await fetchDanmakuWithGuard({
      c,
      upstreamKey: 'dandan',
      cacheKey,
      ttlMs: DANMAKU_CACHE_TTL.subject,
      keyPrefix: 'dandan:',
      loader: async () => {
        const json = (await dandanGet(`/api/v2/bangumi/${id}`)) as {
          success?: boolean
          errorCode?: number
          errorMessage?: string
          bangumi?: { episodes?: Array<Record<string, unknown>>; animeId?: number }
        }
        if (json.success === false) {
          if (json.errorCode === 7 || json.errorMessage?.includes('无法找到')) {
            return {
              bangumiId: Number(id) || 0,
              episodes: [],
            }
          }
          throw new Error(json.errorMessage || '弹弹番剧详情查询失败')
        }
        const episodes = (json.bangumi?.episodes || []).map((e) => ({
          episodeId: Number(e.episodeId),
          episodeTitle: String(e.episodeTitle ?? ''),
        }))
        return {
          bangumiId: Number(json.bangumi?.animeId ?? id),
          episodes,
        }
      },
    })
    c.header('X-Cache', hit ? 'HIT' : 'MISS')
    setDanmakuCdnHeaders(c, bypassUsed)
    return c.json({ data: result })
  } catch (e) {
    if (e instanceof SourceRateLimitError) {
      c.header('Retry-After', String(e.retryAfterSec))
      return c.json(
        { error: 'rate_limited', message: e.message, retryAfter: e.retryAfterSec },
        429,
      )
    }
    return c.json(
      { error: 'upstream', message: e instanceof Error ? e.message : String(e) },
      502,
    )
  }
})

danmakuRoutes.get('/comment/:episodeId', async (c) => {
  const episodeId = c.req.param('episodeId')
  if (!/^\d+$/.test(episodeId)) {
    return c.json({ error: 'bad_request', message: 'episodeId 必须为纯数字' }, 400)
  }
  const withRelated = c.req.query('withRelated') ?? 'true'
  const chConvert = c.req.query('chConvert') ?? '1'
  const cacheKey = `dandan:comment:${episodeId}:${withRelated}:${chConvert}`
  try {
    const { value: result, hit, bypassUsed } = await fetchDanmakuWithGuard({
      c,
      upstreamKey: 'dandan',
      cacheKey,
      ttlMs: DANMAKU_CACHE_TTL.comments,
      keyPrefix: 'dandan:',
      loader: async () => {
        const json = (await dandanGet(`/api/v2/comment/${episodeId}`, {
          withRelated,
          chConvert,
        })) as { comments?: { m: string; p: string }[]; count?: number }
        const comments = parseDanmakuComments(json.comments || [])
        return {
          comments,
          count: json.count ?? comments.length,
        }
      },
    })
    c.header('X-Cache', hit ? 'HIT' : 'MISS')
    setDanmakuCdnHeaders(c, bypassUsed)
    return c.json({ data: result.comments, count: result.count })
  } catch (e) {
    if (e instanceof SourceRateLimitError) {
      c.header('Retry-After', String(e.retryAfterSec))
      return c.json(
        { error: 'rate_limited', message: e.message, retryAfter: e.retryAfterSec },
        429,
      )
    }
    return c.json(
      { error: 'upstream', message: e instanceof Error ? e.message : String(e) },
      502,
    )
  }
})
