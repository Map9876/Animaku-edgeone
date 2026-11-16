import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { danmakuRoutes } from './danmaku'
import { bangumiRoutes } from './bangumi'
import { bilibiliDanmakuRoutes } from './bilibili-danmaku'
import {
  checkSourceRateLimit,
  clearSourceRateLimits,
  SourceRateLimitError,
} from '../lib/source-rate-limit'
import {
  fetchDanmakuWithGuard,
  clearDanmakuBypassCooldowns,
} from '../lib/danmaku-guard'
import { cacheGet, cacheDelete } from '../lib/ttl-cache'

test('Route Param Digit Guards: non-numeric IDs are strictly rejected with 400', async () => {
  // Danmaku routes
  const resDanmakuBgm = await danmakuRoutes.request('/bangumi/bgmtv/abc')
  assert.equal(resDanmakuBgm.status, 400)
  const jsonDanmakuBgm = (await resDanmakuBgm.json()) as { error: string }
  assert.equal(jsonDanmakuBgm.error, 'bad_request')

  const resDanmakuId = await danmakuRoutes.request('/bangumi/invalid_id')
  assert.equal(resDanmakuId.status, 400)

  const resDanmakuEp = await danmakuRoutes.request('/comment/not_a_number')
  assert.equal(resDanmakuEp.status, 400)

  // Bangumi active routes
  const resBangumiComments = await bangumiRoutes.request('/subjects/evil_string/comments')
  assert.equal(resBangumiComments.status, 400)
  const jsonBangumiComments = (await resBangumiComments.json()) as { error: string }
  assert.equal(jsonBangumiComments.error, 'bad_request')

  const resBangumiCol = await bangumiRoutes.request('/collections/bad_id', {
    headers: { Authorization: 'Bearer test_token' },
  })
  assert.equal(resBangumiCol.status, 400)
})

test('Danmaku Rate Limiter: checkSourceRateLimit enforces danmaku operation quota', () => {
  clearSourceRateLimits()
  const ip = '198.51.100.99'
  const upstream = 'dandan'

  // Default limit is 60 requests per minute
  for (let i = 0; i < 60; i++) {
    const res = checkSourceRateLimit(ip, upstream, 'danmaku')
    assert.equal(res.allowed, true)
  }

  // 61st request must be denied
  const exceeded = checkSourceRateLimit(ip, upstream, 'danmaku')
  assert.equal(exceeded.allowed, false)
  assert.ok(exceeded.retryAfterSec > 0)
  assert.equal(exceeded.remaining, 0)
})

test('fetchDanmakuWithGuard: checks rate limit BEFORE cache deletion, preserving cache on 429', async () => {
  clearSourceRateLimits()
  clearDanmakuBypassCooldowns()

  const ip = '203.0.113.88'
  const cacheKey = 'test:danmaku:item1'
  cacheDelete(cacheKey)

  const mockApp = new Hono()
  let loaderCalls = 0
  mockApp.get('/test', async (c) => {
    const res = await fetchDanmakuWithGuard({
      c,
      upstreamKey: 'dandan',
      cacheKey,
      ttlMs: 60_000,
      loader: async () => {
        loaderCalls++
        return { version: loaderCalls, content: 'cached_danmaku_data' }
      },
    })
    return c.json(res)
  })

  // 1. 首次请求：未命中缓存，出站成功并写入缓存
  const res1 = await mockApp.request('/test', {
    headers: { 'X-Forwarded-For': ip },
  })
  assert.equal(res1.status, 200)
  const data1 = (await res1.json()) as { value: { version: number }; hit: boolean }
  assert.equal(data1.value.version, 1)
  assert.equal(data1.hit, false)
  assert.equal(loaderCalls, 1)

  // 2. 正常读取：直接命中缓存，无需调用 loader
  const res2 = await mockApp.request('/test', {
    headers: { 'X-Forwarded-For': ip },
  })
  const data2 = (await res2.json()) as { value: { version: number }; hit: boolean }
  assert.equal(data2.value.version, 1)
  assert.equal(data2.hit, true)
  assert.equal(loaderCalls, 1)

  // 3. 耗尽该 IP 的 danmaku 配额（已用 1 次，循环 59 次使总数达到 60 上限）
  for (let i = 0; i < 59; i++) {
    const limit = checkSourceRateLimit(ip, 'dandan', 'danmaku')
    assert.equal(limit.allowed, true)
  }

  // 4. 此时配额已满；使用 refresh=1 尝试强制 bypass 刷新
  // 由于时序修复（先限次后删缓存），此处应抛出 429 错误，且绝不能提前删除已存在的缓存
  let caughtError: unknown
  const mockFailApp = new Hono()
  mockFailApp.get('/test-bypass', async (c) => {
    try {
      await fetchDanmakuWithGuard({
        c,
        upstreamKey: 'dandan',
        cacheKey,
        ttlMs: 60_000,
        loader: async () => {
          loaderCalls++
          return { version: loaderCalls, content: 'new_data' }
        },
      })
      return c.text('ok')
    } catch (e) {
      caughtError = e
      if (e instanceof SourceRateLimitError) {
        c.header('Retry-After', String(e.retryAfterSec))
        return c.json({ error: 'rate_limited', retryAfter: e.retryAfterSec }, 429)
      }
      return c.text('error', 500)
    }
  })

  const res3 = await mockFailApp.request('/test-bypass?refresh=1', {
    headers: { 'X-Forwarded-For': ip },
  })
  assert.equal(res3.status, 429)
  assert.ok(res3.headers.get('Retry-After'))
  assert.ok(caughtError instanceof SourceRateLimitError)
  // loader 不应该被执行
  assert.equal(loaderCalls, 1)

  // 5. 关键验证：验证原先的缓存是否完好保留！
  const preservedCache = cacheGet<{ version: number }>(cacheKey)
  assert.ok(preservedCache !== undefined, '旧缓存必须完好无损地保留在缓存中')
  assert.equal(preservedCache?.version, 1)
})

test('Bilibili Danmaku Route: handles rate limit 429 properly', async () => {
  clearSourceRateLimits()
  clearDanmakuBypassCooldowns()

  const ip = '198.51.100.77'
  // 耗尽 IP 对 bilibili 的配额（60 次）
  for (let i = 0; i < 60; i++) {
    checkSourceRateLimit(ip, 'bilibili', 'danmaku')
  }

  // 再次请求一个未缓存的 BV 号
  const res = await bilibiliDanmakuRoutes.request('/bilibili?bvid=BV1untested429', {
    headers: { 'X-Forwarded-For': ip },
  })

  assert.equal(res.status, 429)
  assert.ok(res.headers.get('Retry-After'))
  const json = (await res.json()) as { error: string; retryAfter: number }
  assert.equal(json.error, 'rate_limited')
  assert.ok(json.retryAfter > 0)
})
