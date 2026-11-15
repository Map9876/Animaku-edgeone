import test from 'node:test'
import assert from 'node:assert/strict'
import { readTextLimited } from './http'

test('readTextLimited: successfully reads normal payloads within limits', async () => {
  const content = 'Hello, world! '.repeat(100)
  const res = new Response(content, {
    headers: { 'content-type': 'text/plain' },
  })
  const text = await readTextLimited(res, 50_000, 'test')
  assert.equal(text, content)
})

test('readTextLimited: rejects responses exceeding Content-Length cap immediately', async () => {
  const largeSize = 3_000_000
  const res = new Response('x', {
    headers: {
      'content-length': String(largeSize),
    },
  })
  await assert.rejects(
    () => readTextLimited(res, 2_500_000, 'test-cl'),
    /响应过大/,
  )
})

test('readTextLimited: stream cancels when chunked bytes exceed limit', async () => {
  let streamCancelled = false
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(10_000)) // 10KB chunk
    },
    cancel() {
      streamCancelled = true
    },
  })

  const res = new Response(stream)
  await assert.rejects(
    // Limit to 25KB, chunk stream enqueues indefinitely
    () => readTextLimited(res, 25_000, 'test-stream'),
    /响应过大/,
  )
  assert.equal(streamCancelled, true)
})
