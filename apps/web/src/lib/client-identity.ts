const STORAGE_KEY = 'animaku_device_id'
const DEVICE_ID_REGEX = /^dev_[0-9a-fA-F]{32}$/

let memoryDeviceId: string | null = null

/**
 * Generate a cryptographically secure or pseudo-random unique device ID.
 */
function generateDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return `dev_${crypto.randomUUID().replace(/-/g, '')}`
    } catch {}
  }

  // Fallback random hex generator
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
  return `dev_${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}${s4()}`
}

/**
 * Get or initialize persistent client device identifier.
 * Cached in memory for 0ms synchronous access.
 * Automatically validates and heals legacy or malformed IDs.
 */
export function getDeviceId(): string {
  if (memoryDeviceId && DEVICE_ID_REGEX.test(memoryDeviceId)) return memoryDeviceId

  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && DEVICE_ID_REGEX.test(stored.trim())) {
        memoryDeviceId = stored.trim()
        return memoryDeviceId
      }

      const fresh = generateDeviceId()
      localStorage.setItem(STORAGE_KEY, fresh)
      memoryDeviceId = fresh
      return fresh
    }
  } catch {
    /* private browsing or localStorage blocked */
  }

  if (!memoryDeviceId || !DEVICE_ID_REGEX.test(memoryDeviceId)) {
    memoryDeviceId = generateDeviceId()
  }
  return memoryDeviceId
}
