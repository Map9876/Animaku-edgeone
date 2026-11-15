import test from 'node:test'
import assert from 'node:assert/strict'
import { assertOwnSourceUrl } from './source-guard'

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
