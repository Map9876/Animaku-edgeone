import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { config } from '../config'
import { isAuthorizedAdmin } from './indexnow'
import { ipAccessAndRateLimit } from './ip-rate-limit'

test('Security Matrix: admin authorization strictness', async () => {
  const app = new Hono()
  app.get('/test-admin', (c) => {
    const ok = isAuthorizedAdmin(c)
    return c.json({ authorized: ok }, ok ? 200 : 403)
  })

  // 1. When ADMIN_SECRET is not configured
  config.adminSecret = ''

  // 1.1 Local loopback must be rejected (no loopback exemption)
  const resLoopback = await app.request('/test-admin', {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  })
  assert.equal(resLoopback.status, 403)

  const resIpv6Loopback = await app.request('/test-admin', {
    headers: { 'x-forwarded-for': '::1' },
  })
  assert.equal(resIpv6Loopback.status, 403)

  // 1.2 Attempting with secret header when unconfigured must still be rejected
  const resSecretHeader = await app.request('/test-admin', {
    headers: { 'x-admin-secret': 'some-random-secret' },
  })
  assert.equal(resSecretHeader.status, 403)

  // 2. When ADMIN_SECRET is configured
  const validSecret = 'super-secret-key-12345'
  config.adminSecret = validSecret

  try {
    // 2.1 Valid header authorized
    const resAuth = await app.request('/test-admin', {
      headers: { 'x-admin-secret': validSecret },
    })
    assert.equal(resAuth.status, 200)
    const jsonAuth = (await resAuth.json()) as { authorized: boolean }
    assert.equal(jsonAuth.authorized, true)

    // 2.2 Invalid header rejected
    const resBadAuth = await app.request('/test-admin', {
      headers: { 'x-admin-secret': 'wrong-key' },
    })
    assert.equal(resBadAuth.status, 403)

    // 2.3 Query parameter (?secret=) is deprecated and strictly rejected
    const resQueryParam = await app.request(`/test-admin?secret=${validSecret}`)
    assert.equal(resQueryParam.status, 403)

    // 2.4 Loopback without valid header rejected
    const resLoopbackNoHeader = await app.request('/test-admin', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })
    assert.equal(resLoopbackNoHeader.status, 403)
  } finally {
    config.adminSecret = ''
  }
})

test('Security Matrix: IP rate limiting does not exempt loopback addresses', async () => {
  const app = new Hono()
  // Configure low limit: 2 requests per second
  app.use('*', ipAccessAndRateLimit({ apiLimitPerSec: 2, heavyLimitPerSec: 2 }))
  app.get('/api/test-target', (c) => c.json({ ok: true }))

  const fakeLoopbackIp = '127.0.0.2'
  const headers = { 'x-forwarded-for': fakeLoopbackIp }

  // 1st request -> ok
  const r1 = await app.request('/api/test-target', { headers })
  assert.equal(r1.status, 200)

  // 2nd request -> ok
  const r2 = await app.request('/api/test-target', { headers })
  assert.equal(r2.status, 200)

  // 3rd request -> rate limit exceeded (429)
  const r3 = await app.request('/api/test-target', { headers })
  assert.equal(r3.status, 429)
  const errJson = (await r3.json()) as { error: string }
  assert.equal(errJson.error, 'too_many_requests')
})
