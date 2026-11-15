import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBilibiliInput } from '@animaku/shared'
import { bilibiliDanmakuRoutes } from '../routes/bilibili-danmaku'

test('Bilibili input parsing: accepts trusted hosts and raw IDs, strictly rejects external domains', () => {
  // 1. Valid raw identifiers
  const bv = parseBilibiliInput('BV1TT4y1g77n')
  assert.equal(bv?.type, 'bv')
  assert.equal((bv as any).bvid, 'BV1TT4y1g77n')

  const bgm = parseBilibiliInput('bgm1728')
  assert.equal(bgm?.type, 'bgm')
  assert.equal((bgm as any).bangumiId, 1728)

  const ep = parseBilibiliInput('ep86012')
  assert.equal(ep?.type, 'ep')
  assert.equal((ep as any).epId, 86012)

  const ss = parseBilibiliInput('ss28277')
  assert.equal(ss?.type, 'ss')
  assert.equal((ss as any).seasonId, 28277)

  // 2. Valid canonical URLs from trusted domains
  const bvidUrl = parseBilibiliInput('https://www.bilibili.com/video/BV1TT4y1g77n?p=2')
  assert.equal(bvidUrl?.type, 'bv')
  assert.equal((bvidUrl as any).bvid, 'BV1TT4y1g77n')
  assert.equal(bvidUrl?.page, 2)

  const b23 = parseBilibiliInput('https://b23.tv/AbCdEf')
  assert.equal(b23?.type, 'b23')
  assert.equal((b23 as any).url, 'https://b23.tv/AbCdEf')

  const bgmUrl = parseBilibiliInput('https://bangumi.tv/subject/1728')
  assert.equal(bgmUrl?.type, 'bgm')
  assert.equal((bgmUrl as any).bangumiId, 1728)

  // 3. External arbitrary domains strictly rejected
  assert.equal(parseBilibiliInput('https://attacker.com/b23.tv/x'), null)
  assert.equal(parseBilibiliInput('https://attacker.com/video/BV1TT4y1g77n'), null)
  assert.equal(parseBilibiliInput('https://evil.com/ep86012'), null)
  assert.equal(parseBilibiliInput('http://127.0.0.1/ss28277'), null)
})

test('Bilibili Danmaku Route: rejects external arbitrary URLs with 400 bad_request', async () => {
  const res = await bilibiliDanmakuRoutes.request(
    '/bilibili?input=https://attacker.com/b23.tv/x',
  )
  assert.equal(res.status, 400)
  const json = (await res.json()) as { error: string }
  assert.equal(json.error, 'bad_request')
})
