import test from 'node:test'
import assert from 'node:assert/strict'
import { assertOwnSourceUrl, resolveSafeBaseUrl } from './source-guard'

test('resolveSafeBaseUrl: validates client-provided baseURL and protects against arbitrary proxying', () => {
  const official = 'https://animoe.org'
  const mirrors = ['animoe.org', 'animoe.net']

  // 1. Valid mirror adopted
  assert.equal(
    resolveSafeBaseUrl('https://animoe.net', official, mirrors),
    'https://animoe.net',
  )
  assert.equal(
    resolveSafeBaseUrl('https://sub.animoe.org/', official, mirrors),
    'https://sub.animoe.org',
  )

  // 2. Malicious / external baseURL rejected, falls back to official default
  assert.equal(
    resolveSafeBaseUrl('https://attacker.com', official, mirrors),
    'https://animoe.org',
  )
  assert.equal(
    resolveSafeBaseUrl('https://evil-animoe.org', official, mirrors),
    'https://animoe.org',
  )
  assert.equal(
    resolveSafeBaseUrl('', official, mirrors),
    'https://animoe.org',
  )

  // 3. assertOwnSourceUrl rejects external URL even if malicious baseURL was attempted
  assert.throws(
    () => assertOwnSourceUrl('https://attacker.com/evil.html', 'https://attacker.com', mirrors),
    /is not an allowed domain/,
  )
})

test('assertOwnSourceUrl: validates allowed domains and rejects external/malicious targets', () => {
  const base = 'https://animoe.org'
  const mirrors = ['animoe.org', 'animoe.net']

  // 1. Relative paths succeed and format into absolute URLs
  assert.equal(
    assertOwnSourceUrl('/detail/12345', base, mirrors),
    'https://animoe.org/detail/12345',
  )
  assert.equal(
    assertOwnSourceUrl('detail/12345', base, mirrors),
    'https://animoe.org/detail/12345',
  )

  // 2. Exact allowed domains succeed
  assert.equal(
    assertOwnSourceUrl('https://animoe.org/play/100', base, mirrors),
    'https://animoe.org/play/100',
  )
  assert.equal(
    assertOwnSourceUrl('https://animoe.net/play/100', base, mirrors),
    'https://animoe.net/play/100',
  )

  // 3. Subdomains of allowed hosts succeed
  assert.equal(
    assertOwnSourceUrl('https://m.animoe.org/play/100', base, mirrors),
    'https://m.animoe.org/play/100',
  )
  assert.equal(
    assertOwnSourceUrl('https://api.v2.animoe.net/play/100', base, mirrors),
    'https://api.v2.animoe.net/play/100',
  )

  // 4. External arbitrary hosts strictly rejected
  assert.throws(
    () => assertOwnSourceUrl('https://example.com/evil.html', base, mirrors),
    /is not an allowed domain/,
  )
  assert.throws(
    () => assertOwnSourceUrl('http://198.51.100.1/evil', base, mirrors),
    /is not an allowed domain/,
  )

  // 5. Host spoofing and prefix/suffix attacks strictly rejected
  assert.throws(
    () => assertOwnSourceUrl('https://evil-animoe.org/play', base, mirrors),
    /is not an allowed domain/,
  )
  assert.throws(
    () => assertOwnSourceUrl('https://animoe.org.attacker.com/play', base, mirrors),
    /is not an allowed domain/,
  )
  assert.throws(
    () => assertOwnSourceUrl('https://animoe.org@attacker.com/play', base, mirrors),
    /is not an allowed domain/,
  )

  // 6. Invalid protocols and malformed inputs rejected
  assert.throws(
    () => assertOwnSourceUrl('javascript:alert(1)', base, mirrors),
    /only http and https are permitted/,
  )
  assert.throws(
    () => assertOwnSourceUrl('', base, mirrors),
    /cannot be empty/,
  )
})
