import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { isStaticAssetPath, accessLogger, resolveRequestId, isLogLevelEnabled } from './logger'
import { config } from '../config'

test('resolveRequestId: validates format and prevents log injection', () => {
  // 1. Valid client IDs (allowed: [A-Za-z0-9_-]{8,64})
  assert.equal(resolveRequestId('valid-req-id-123'), 'valid-req-id-123')
  assert.equal(resolveRequestId('Req_12345678'), 'Req_12345678')

  // 2. CRLF injection attempt -> must reject and fallback to generated hex
  const injection = 'req-1234\r\n[CRITICAL] fake log'
  const sanitized1 = resolveRequestId(injection)
  assert.notEqual(sanitized1, injection)
  assert.match(sanitized1, /^[0-9a-f]{8}$/)

  // 3. Invalid characters or length -> reject
  assert.match(resolveRequestId('short'), /^[0-9a-f]{8}$/)
  assert.match(resolveRequestId('has spaces 12345'), /^[0-9a-f]{8}$/)
  assert.match(resolveRequestId(''), /^[0-9a-f]{8}$/)
  assert.match(resolveRequestId(undefined), /^[0-9a-f]{8}$/)
})

test('isLogLevelEnabled: correctly filters by weight', () => {
  assert.equal(isLogLevelEnabled('debug', 'info'), false)
  assert.equal(isLogLevelEnabled('info', 'info'), true)
  assert.equal(isLogLevelEnabled('warn', 'info'), true)
  assert.equal(isLogLevelEnabled('error', 'info'), true)

  assert.equal(isLogLevelEnabled('info', 'warn'), false)
  assert.equal(isLogLevelEnabled('warn', 'warn'), true)
  assert.equal(isLogLevelEnabled('error', 'warn'), true)

  assert.equal(isLogLevelEnabled('error', 'silent'), false)
})

test('isStaticAssetPath: correctly classifies static assets and SPA/API routes', () => {
  // Vite build assets
  assert.equal(isStaticAssetPath('/assets/index-B_xxxx.js'), true)
  assert.equal(isStaticAssetPath('/assets/vendor-1234.css'), true)
  assert.equal(isStaticAssetPath('/assets/font-5678.woff2'), true)
  assert.equal(isStaticAssetPath('/assets/chunk.map'), true)

  // Standard web icons and manifest
  assert.equal(isStaticAssetPath('/favicon.ico'), true)
  assert.equal(isStaticAssetPath('/favicon-16x16.png'), true)
  assert.equal(isStaticAssetPath('/favicon-32x32.png'), true)
  assert.equal(isStaticAssetPath('/site.webmanifest'), true)
  assert.equal(isStaticAssetPath('/apple-touch-icon.png'), true)
  assert.equal(isStaticAssetPath('/android-chrome-192x192.png'), true)
  assert.equal(isStaticAssetPath('/logo.png'), true)

  // Extensions
  assert.equal(isStaticAssetPath('/images/hero.webp'), true)
  assert.equal(isStaticAssetPath('/icons/play.svg'), true)

  // Must NOT classify API endpoints as static assets, even if having extensions or asset in name
  assert.equal(isStaticAssetPath('/api/bangumi/subjects/12345'), false)
  assert.equal(isStaticAssetPath('/api/assets/export.json'), false)
  assert.equal(isStaticAssetPath('/api/danmaku/comment/1'), false)
  assert.equal(isStaticAssetPath('/api/source/resolve'), false)

  // SEO & SPA routes must NOT be filtered
  assert.equal(isStaticAssetPath('/subject/12345'), false)
  assert.equal(isStaticAssetPath('/timeline'), false)
  assert.equal(isStaticAssetPath('/anime'), false)
  assert.equal(isStaticAssetPath('/robots.txt'), false)
  assert.equal(isStaticAssetPath('/sitemap.xml'), false)
  assert.equal(isStaticAssetPath('/llms.txt'), false)
})

test('accessLogger: silences successful /assets/* requests while keeping errors & API logs', async () => {
  const originalLog = console.log
  const loggedLines: string[] = []
  console.log = (msg: unknown) => {
    loggedLines.push(String(msg))
  }

  const prevLogStaticAssets = config.logStaticAssets

  try {
    config.logStaticAssets = false

    const app = new Hono()
    app.use('*', accessLogger())

    // Mock routes
    app.get('/assets/index-test.js', (c) => c.text('console.log("app")', 200))
    app.get('/assets/missing.js', (c) => c.text('not found', 404))
    app.get('/api/test', (c) => c.json({ ok: true }, 200))

    // 1. Successful /assets/ chunk should be completely SILENT
    loggedLines.length = 0
    const resAsset = await app.request('/assets/index-test.js')
    assert.equal(resAsset.status, 200)
    assert.equal(loggedLines.length, 0, 'Successful /assets/ request should not be logged')

    // 2. Failed /assets/ chunk (404) should be LOGGED for debugging
    loggedLines.length = 0
    const resMissing = await app.request('/assets/missing.js')
    assert.equal(resMissing.status, 404)
    assert.equal(loggedLines.length, 1, '404 on /assets/ must still be logged')
    assert.match(loggedLines[0], /\/assets\/missing\.js/)

    // 3. Normal API route should be LOGGED
    loggedLines.length = 0
    const resApi = await app.request('/api/test')
    assert.equal(resApi.status, 200)
    assert.equal(loggedLines.length, 1, 'API request must be logged')
    assert.match(loggedLines[0], /\/api\/test/)

    // 4. When LOG_STATIC_ASSETS is explicitly true, /assets/ 200 is LOGGED
    config.logStaticAssets = true
    loggedLines.length = 0
    const resAssetAllowed = await app.request('/assets/index-test.js')
    assert.equal(resAssetAllowed.status, 200)
    assert.equal(loggedLines.length, 1, 'Should log /assets/ when logStaticAssets is enabled')
    assert.match(loggedLines[0], /\/assets\/index-test\.js/)
  } finally {
    console.log = originalLog
    config.logStaticAssets = prevLogStaticAssets
  }
})

test('accessLogger: Request ID handling, heartbeat silence and LOG_LEVEL filtering', async () => {
  const originalLog = console.log
  const loggedLines: string[] = []
  console.log = (msg: unknown) => {
    loggedLines.push(String(msg))
  }

  const prevLogLevel = config.logLevel

  try {
    const app = new Hono()
    app.use('*', accessLogger())

    app.get('/api/test', (c) => c.json({ ok: true }, 200))
    app.get('/api/error', (c) => c.json({ error: 'fail' }, 500))
    app.post('/api/stats/ping', (c) => c.json({ ok: true }, 200))
    app.post('/api/stats/active', (c) => c.json({ ok: true }, 200))
    app.post('/api/stats/ping-err', (c) => c.json({ ok: false }, 500))

    // 1. Valid Request-ID header is echoed and printed
    config.logLevel = 'info'
    loggedLines.length = 0
    const resValid = await app.request('/api/test', {
      headers: { 'x-request-id': 'client-trace-1234' },
    })
    assert.equal(resValid.headers.get('x-request-id'), 'client-trace-1234')
    assert.equal(loggedLines.length, 1)
    assert.match(loggedLines[0], /\[client-trace-1234\]/)

    // 2. Invalid/malformed header (e.g. contains special symbols, spaces, or wrong length)
    // is rejected and echoed as a freshly generated 8-char hex ID
    loggedLines.length = 0
    const resInjected = await app.request('/api/test', {
      headers: { 'x-request-id': 'bad_id_with_$$$_and_spaces' },
    })
    const generatedId = resInjected.headers.get('x-request-id')
    assert.ok(generatedId && /^[0-9a-f]{8}$/.test(generatedId))
    assert.equal(loggedLines.length, 1)
    assert.match(loggedLines[0], new RegExp(`\\[${generatedId}\\]`))

    // 3. Heartbeat endpoints /api/stats/ping and /active are SILENT on success (< 400)
    loggedLines.length = 0
    const resPing = await app.request('/api/stats/ping', { method: 'POST' })
    assert.equal(resPing.status, 200)
    assert.equal(loggedLines.length, 0, 'Successful /api/stats/ping must be silent')

    const resActive = await app.request('/api/stats/active', { method: 'POST' })
    assert.equal(resActive.status, 200)
    assert.equal(loggedLines.length, 0, 'Successful /api/stats/active must be silent')

    // 4. LOG_LEVEL=warn filters out normal 200 info logs but keeps 500 error logs
    config.logLevel = 'warn'
    loggedLines.length = 0
    const resInfo = await app.request('/api/test')
    assert.equal(resInfo.status, 200)
    assert.equal(loggedLines.length, 0, '200 request should be filtered when LOG_LEVEL=warn')

    const resErr = await app.request('/api/error')
    assert.equal(resErr.status, 500)
    assert.equal(loggedLines.length, 1, '500 error should be logged when LOG_LEVEL=warn')
  } finally {
    console.log = originalLog
    config.logLevel = prevLogLevel
  }
})
