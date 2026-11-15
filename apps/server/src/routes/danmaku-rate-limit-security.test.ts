import test from 'node:test'
import assert from 'node:assert/strict'
import { danmakuRoutes } from './danmaku'
import { bangumiRoutes } from './bangumi'
import {
  checkSourceRateLimit,
  clearSourceRateLimits,
} from '../lib/source-rate-limit'

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
