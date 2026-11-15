import { config } from '../config'
import { fetchPublic } from './private-host'

const DEFAULT_TIMEOUT_MS = 15_000

function withTimeoutSignal(
  init: RequestInit,
  timeoutMs: number,
): { signal: AbortSignal; clear: () => void } {
  if (init.signal) {
    // Caller owns abort — still bound wall time with a linked timeout when possible
    const ac = new AbortController()
    const onAbort = () => {
      try {
        ac.abort(init.signal?.reason)
      } catch {
        ac.abort()
      }
    }
    if (init.signal.aborted) onAbort()
    else init.signal.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      try {
        ac.abort(
          new DOMException(`请求超时 (${Math.round(timeoutMs / 1000)}s)`, 'TimeoutError'),
        )
      } catch {
        ac.abort()
      }
    }, timeoutMs)
    timer.unref?.()
    return {
      signal: ac.signal,
      clear: () => {
        clearTimeout(timer)
        init.signal?.removeEventListener('abort', onAbort)
      },
    }
  }
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return {
      signal: AbortSignal.timeout(timeoutMs),
      clear: () => {},
    }
  }
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  timer.unref?.()
  return { signal: ac.signal, clear: () => clearTimeout(timer) }
}

export async function bangumiFetch(
  url: string,
  init: RequestInit & { token?: string; timeoutMs?: number } = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', config.bangumiUserAgent)
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`)
  }
  const { token: _t, timeoutMs, ...rest } = init
  const ms = timeoutMs ?? DEFAULT_TIMEOUT_MS
  return fetchPublic(url, { ...rest, headers }, { timeoutMs: ms, source: 'bangumi' })
}

export function getBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export const DEFAULT_BODY_MAX_BYTES = 2_500_000

/**
 * 流式读取 HTTP 响应体文本，并严格执行字节数上限。
 * 若超过上限则立即中断 (cancel) 响应体，释放 socket 并抛错，防止 OOM 内存耗尽。
 */
export async function readTextLimited(
  res: Response,
  maxBytes: number = DEFAULT_BODY_MAX_BYTES,
  label: string = 'http',
): Promise<string> {
  const cl = res.headers.get('content-length')
  if (cl) {
    const n = Number(cl)
    if (Number.isFinite(n) && n > maxBytes) {
      try {
        await res.body?.cancel()
      } catch {
        /* ignore */
      }
      throw new Error(`${label} 响应过大 (${n} > ${maxBytes} bytes)`)
    }
  }

  if (!res.body) return res.text()

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value?.byteLength) continue
    total += value.byteLength
    if (total > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        /* ignore */
      }
      throw new Error(`${label} 响应过大 (>${maxBytes} bytes)`)
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged)
}
