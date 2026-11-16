/**
 * 判断指定的主机名是否精确等于或属于某个允许的主机名/域名的合法子域名。
 */
export function isHostAllowed(hostname: string, allowedHosts: Iterable<string>): boolean {
  const target = hostname.trim().toLowerCase()
  for (const h of allowedHosts) {
    const cleaned = h.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
    if (!cleaned) continue
    if (target === cleaned || target.endsWith('.' + cleaned)) {
      return true
    }
  }
  return false
}

/**
 * 校验并解析安全的基准 URL。
 * 客户端自定义规则中的 rule.baseURL 只有在其主机名属于该源固定的合法镜像白名单时才被采纳，
 * 否则强制回退到内置的官方默认基准域名，防范 /api/plugin/* 攻击者篡改 baseURL 进行任意网页探测。
 */
export function resolveSafeBaseUrl(
  ruleBaseUrl: string | undefined,
  defaultBaseUrl: string,
  allowedHosts: string[],
): string {
  const fallback = defaultBaseUrl.replace(/\/+$/, '')
  const raw = (ruleBaseUrl || '').trim()
  if (!raw || !/^https?:\/\//i.test(raw)) {
    return fallback
  }

  try {
    const u = new URL(raw)
    if (isHostAllowed(u.hostname, allowedHosts)) {
      return raw.replace(/\/+$/, '')
    }
  } catch {
    // 忽略格式非法的 URL
  }

  return fallback
}

/**
 * 校验受控源输入的页面地址是否安全并属于该源自身的受信域名。
 *
 * 规则：
 * 1. 白名单完全由受信任的 allowedHosts 决定，绝不盲目信任外部传入的 defaultBaseUrl；
 * 2. 相对路径（以 / 开头或不含协议）：使用安全基准 URL 拼接为完整规范 URL；
 * 3. 绝对地址（含 http/https 协议）：提取其 hostname，必须精确匹配或属于 allowedHosts 的子域名；
 * 4. 任何外部未经授权的域名、非 http/https 协议或畸形 URL，抛出 400 类型的 Error，绝不发起网络请求。
 *
 * @param rawUrl 客户端传入的 detailUrl、source 或 pageUrl
 * @param defaultBaseUrl 源适配器的基准域名（如 rule.baseURL 或内置默认域名）
 * @param allowedHosts 源允许的镜像域名列表（如 ['animoe.org', 'animoe.net']）
 * @returns 经过白名单严格校验后的安全完整 URL
 */
export function assertOwnSourceUrl(
  rawUrl: string,
  defaultBaseUrl: string,
  allowedHosts: string[] = [],
): string {
  const trimmed = (rawUrl || '').trim()
  if (!trimmed) {
    throw new Error('Target page URL cannot be empty')
  }

  // 1. 规范化白名单集合（严格由 allowedHosts 决定）
  const validHostnames = new Set<string>()
  for (const h of allowedHosts) {
    const cleaned = h.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
    if (cleaned) validHostnames.add(cleaned)
  }

  // 防御性兜底：若调用方未传 allowedHosts，才降级使用 defaultBaseUrl
  if (validHostnames.size === 0) {
    try {
      const baseHost = new URL(defaultBaseUrl).hostname.toLowerCase()
      if (baseHost) validHostnames.add(baseHost)
    } catch {
      // ignore
    }
  }

  // 2. 如果是不含协议的相对路径，安全拼接到 defaultBaseUrl
  const isAbsolute = /^https?:\/\//i.test(trimmed)
  let parsedUrl: URL
  if (!isAbsolute) {
    try {
      parsedUrl = new URL(trimmed, defaultBaseUrl)
    } catch {
      throw new Error(`Invalid relative URL: "${trimmed}"`)
    }
  } else {
    try {
      parsedUrl = new URL(trimmed)
    } catch {
      throw new Error(`Invalid absolute URL: "${trimmed}"`)
    }
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Invalid protocol "${parsedUrl.protocol}", only http and https are permitted`)
  }

  const hostname = parsedUrl.hostname.toLowerCase()

  // 3. 严格域名匹配：hostname 必须精确等于某个允许的主机名，或者是其合法子域名 (.host)
  if (!isHostAllowed(hostname, validHostnames)) {
    throw new Error(
      `Access denied: Target URL host "${hostname}" is not an allowed domain for this source`,
    )
  }

  return parsedUrl.toString()
}
