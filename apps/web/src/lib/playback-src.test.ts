import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pickPlaybackSrc,
  inferPlaybackTransit,
} from './playback-src.ts'

test('pickPlaybackSrc: ticket stream appends adFilter=1 on /stream when forceAdFilter=true', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/stream?t=ticket123',
    forceAdFilter: true,
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.includes('t=ticket123'), true)
  assert.equal(res.src.includes('adFilter=1'), true)
  assert.equal(res.src.includes('token='), false)
  assert.equal(res.transit, 'playlist-proxy')
})

test('pickPlaybackSrc: ticket stream on /stream defaults to playlist-proxy transit', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/stream?t=ticket123',
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.includes('t=ticket123'), true)
  assert.equal(res.transit, 'playlist-proxy')
})

test('pickPlaybackSrc: ticket stream on /segment defaults to full-proxy transit for direct segment/auth', () => {
  const res = pickPlaybackSrc({
    proxyUrl: '/api/media/segment?t=ticket_mp4',
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.includes('t=ticket_mp4'), true)
  assert.equal(res.transit, 'full-proxy')
})

test('pickPlaybackSrc: direct CDN preferred when clean', () => {
  const res = pickPlaybackSrc({
    playUrl: 'https://cdn.example.com/ep1.mp4',
    proxyUrl: '/api/media/stream?t=ticket123',
  })

  assert.equal(res.mode, 'direct')
  assert.equal(res.src, 'https://cdn.example.com/ep1.mp4')
  assert.equal(res.transit, 'direct')
})

test('pickPlaybackSrc: requiresProxy forces ticket proxy over direct CDN', () => {
  const res = pickPlaybackSrc({
    playUrl: 'https://v.anime1.me/ep1.mp4',
    proxyUrl: '/api/media/segment?t=ticket_anime1',
    requiresProxy: true,
  })

  assert.equal(res.mode, 'proxy')
  assert.equal(res.src.startsWith('/api/media/segment?t=ticket_anime1'), true)
  assert.equal(res.canTryDirect, false)
})
