/**
 * 校验受控源输入的页面地址是否安全并属于该源自身的受信域名。
 *
 * 规则：
 * 1. 相对路径（以 / 开头或不含协议）：使用 defaultBaseUrl 拼接为完整规范 URL；
 * 2. 绝对地址（含 http/https 协议）：提取其 hostname，必须精确匹配或属于 allowedHosts（或 defaultBaseUrl 的 hostname）的子域名；
 * 3. 任何外部未经授权的域名、非 http/https 协议或畸形 URL，抛出 400 类型的 Error，绝不发起网络请求。
 *
 * @param rawUrl 客户端传入的 detailUrl、source 或 pageUrl
 * @param defaultBaseUrl 源适配器的基准域名（如 rule.baseURL 或内置默认域名）
 * @param allowedHosts 源允许的额外镜像域名列表（如 ['animoe.org', 'animoe.net']）
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

  // 收集并规范化白名单主机名集合（全部转小写）
  const validHostnames = new Set<string>()
  try {
    const baseHost = new URL(defaultBaseUrl).hostname.toLowerCase()
    if (baseHost) validHostnames.add(baseHost)
  } catch {
    // 忽略无效的 defaultBaseUrl
  }

  for (const h of allowedHosts) {
    const cleaned = h.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]
    if (cleaned) validHostnames.add(cleaned)
  }

  // 1. 如果是不含协议的相对路径，安全拼接到 defaultBaseUrl
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

  // 2. 严格域名匹配：hostname 必须精确等于某个允许的主机名，或者是其合法子域名 (.host)
  let isAllowed = false
  for (const allowed of validHostnames) {
    if (hostname === allowed || hostname.endsWith('.' + allowed)) {
      isAllowed = true
      break
    }
  }

  if (!isAllowed) {
    throw new Error(
      `Access denied: Target URL host "${hostname}" is not an allowed domain for this source`,
    )
  }

  return parsedUrl.toString()
}
