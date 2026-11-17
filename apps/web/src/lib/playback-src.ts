/**
 * Choose video src: prefer direct CDN URL to save server bandwidth,
 * use media proxy when required by source capability (e.g. cookie auth)
 * or when proxy ad-filter requires server handling.
 *
 * Always use proxy *entry* when:
 * - no playUrl
 * - proxy carries cookie= (auth-gated progressive sources like Anime1)
 * - proxy carries adFilter= / forceAdFilter (playlist must be server-filtered;
 *   modern HLS AST pipeline then rewrites segments to 302 CDN direct redirect)
 */

export type PlaybackSrcMode = 'direct' | 'proxy'

/**
 * How media bytes are expected to flow for the chosen src.
 * - direct: entry is bare CDN URL
 * - full-proxy: stream requires server credential relay (e.g. Anime1 cookie)
 * - playlist-proxy: entry via proxy for ad strip/cross-origin; segments 302 direct to CDN
 */
export type PlaybackTransit = 'direct' | 'full-proxy' | 'playlist-proxy'

export function proxyRequiresAuth(proxyUrl: string | undefined | null): boolean {
  if (!proxyUrl) return false
  return /[?&]cookie=/.test(proxyUrl)
}

/** Proxy URL already requests HLS discontinuity ad-filter */
export function proxyHasAdFilter(proxyUrl: string | undefined | null): boolean {
  if (!proxyUrl) return false
  return (
    /[?&]adFilter=1(?:&|$)/.test(proxyUrl) ||
    /[?&]adFilter=true(?:&|$)/.test(proxyUrl)
  )
}

/** Whether URL is a modern ticket-based media stream */
export function isTicketStream(url: string | undefined | null): boolean {
  if (!url) return false
  return (
    url.startsWith('/api/media/stream') ||
    url.startsWith('/api/media/segment')
  )
}

/** Short UI label for WatchMeta (简介条). */
export function playbackTransitLabel(transit: PlaybackTransit): string {
  switch (transit) {
    case 'direct':
      return '直连源站'
    case 'playlist-proxy':
      return '列表代理·分片直连'
    case 'full-proxy':
    default:
      return '经服务器代理'
  }
}

export function inferPlaybackTransit(src: string, mode: PlaybackSrcMode): PlaybackTransit {
  if (mode === 'direct') return 'direct'
  if (!src) return 'full-proxy'
  if (isTicketStream(src)) {
    if (/[?&]stream=(?:1|true)(?:&|$)/.test(src)) return 'full-proxy'
    return src.includes('/segment') ? 'full-proxy' : 'playlist-proxy'
  }
  // Cookie 鉴权源 → 需由服务端中继凭据
  if (proxyRequiresAuth(src)) return 'full-proxy'
  // adFilter → 播放列表代理过滤，分片走 302 直连
  if (proxyHasAdFilter(src)) return 'playlist-proxy'
  return 'full-proxy'
}

function setProxyQueryFlag(proxyUrl: string, key: string, value: string): string {
  if (!proxyUrl) return proxyUrl
  try {
    const u = new URL(proxyUrl, 'http://local.invalid')
    u.searchParams.set(key, value)
    return u.pathname + u.search
  } catch {
    const sep = proxyUrl.includes('?') ? '&' : '?'
    // naive append if not already present
    if (new RegExp(`[?&]${key}=`).test(proxyUrl)) return proxyUrl
    return `${proxyUrl}${sep}${key}=${value}`
  }
}

/**
 * Ensure media proxy URL has adFilter=1 (global force, or merge onto rule URL).
 */
export function withAdFilter(proxyUrl: string): string {
  if (!proxyUrl) return proxyUrl
  if (proxyHasAdFilter(proxyUrl)) return proxyUrl
  return setProxyQueryFlag(proxyUrl, 'adFilter', '1')
}

export function pickPlaybackSrc(opts: {
  playUrl?: string | null
  proxyUrl?: string | null
  /**
   * Global force HLS ad-filter (PlayerSettings.forceAdBlocker).
   * When true, entry src is proxy with adFilter=1 (playlist filter only;
   * segments stay on CDN via 302 redirect).
   */
  forceAdFilter?: boolean
  /** Explicit flag indicating media stream or upstream requires proxy handling (e.g. cookie auth) */
  requiresProxy?: boolean
}): {
  src: string
  mode: PlaybackSrcMode
  transit: PlaybackTransit
  canTryDirect: boolean
} {
  const rawProxy = (opts.proxyUrl || '').trim()
  const play = (opts.playUrl || '').trim()

  const needProxyForAds =
    Boolean(opts.forceAdFilter) || proxyHasAdFilter(rawProxy)

  // 1. 直连 CDN 优先策略（节省服务器宝贵带宽）：
  // 只要源站有直接可用 CDN 链接，且不需要 Cookie 鉴权、未开启广告过滤，首选直连源站！
  const canTryDirect =
    Boolean(play) &&
    /^https?:\/\//i.test(play) &&
    !opts.requiresProxy &&
    !proxyRequiresAuth(rawProxy) &&
    !needProxyForAds

  if (canTryDirect) {
    return {
      src: play,
      mode: 'direct',
      transit: 'direct',
      canTryDirect: true,
    }
  }

  // 2. 当确实需要走服务端代理时（需带 Cookie 鉴权 / 过滤分集广告 / 直连不可用）：
  if (rawProxy) {
    // 现代 Ticket 受控媒体流：装配受控业务选项（adFilter），严禁向 Ticket 注入废弃的 token
    if (isTicketStream(rawProxy)) {
      let ticketUrl = rawProxy

      // 若 forceAdFilter 为 true 且当前为 /stream 路由，追加 &adFilter=1
      if (
        opts.forceAdFilter &&
        (ticketUrl.startsWith('/api/media/stream') || ticketUrl.includes('/api/media/stream'))
      ) {
        if (!/[?&]adFilter=/.test(ticketUrl)) {
          ticketUrl = setProxyQueryFlag(ticketUrl, 'adFilter', '1')
        }
      }

      return {
        src: ticketUrl,
        mode: 'proxy',
        transit: inferPlaybackTransit(ticketUrl, 'proxy'),
        canTryDirect: false,
      }
    }

    let proxy = rawProxy
    if (opts.forceAdFilter && proxy) {
      proxy = withAdFilter(proxy)
    }

    return {
      src: proxy,
      mode: 'proxy',
      transit: inferPlaybackTransit(proxy, 'proxy'),
      canTryDirect: false,
    }
  }
  if (play) {
    return {
      src: play,
      mode: 'direct',
      transit: 'direct',
      canTryDirect: false,
    }
  }
  return {
    src: '',
    mode: 'proxy',
    transit: 'full-proxy',
    canTryDirect: false,
  }
}
