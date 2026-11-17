import type { SuperResolutionMode } from './player'

export interface SiteNavDefaults {
  showGitHub?: boolean
  openInNewTab?: boolean
  /** @deprecated 用户中心现已常驻不可关闭 */
  showUserMenu?: boolean
  /** @deprecated 历史快捷按钮已从顶部导航右侧移除 */
  showHistory?: boolean
  /** @deprecated 主题切换已内置于用户中心下拉菜单 */
  showThemeToggle?: boolean
}

export interface CustomNavLink {
  id: string
  title: string
  url: string
  badge?: string
  target?: '_blank' | '_self'
  highlight?: boolean
  enabled: boolean
  order: number
}

export interface SitePlayerDefaults {
  speed?: number
  autoplay?: boolean
  autoNext?: boolean
  continuePlay?: boolean
  customSeekTime?: number
  superResolution?: SuperResolutionMode
  preferBangumiOped?: boolean
  firstEpisodeProtect?: boolean
  skipOp?: {
    enabled?: boolean
    start?: number
    duration?: number
  }
  skipEd?: {
    enabled?: boolean
    start?: number
    duration?: number
  }
}

export interface SiteDanmakuDefaults {
  enabled?: boolean
  opacity?: number
  fontSize?: number
  speed?: number
  area?: number
  showTop?: boolean
  showBottom?: boolean
  showScroll?: boolean
  showColor?: boolean
  simplify?: boolean
  filters?: string[]
}

export interface SiteDefaultSettings {
  bangumiImageHost?: string
  theme?: 'light' | 'dark'
  nav?: SiteNavDefaults
  player?: SitePlayerDefaults
  danmaku?: SiteDanmakuDefaults
  /** 站点管理员设置的视频源权重偏移量（key 为源名称小写，value 为增加的权重数值） */
  pluginWeights?: Record<string, number>
  pluginOrder?: string[]
  disabledPlugins?: string[]
  /**
   * 每个视频源针对特定 Bangumi ID 的专属加权名单（key 为源名称小写，value 为 bangumiId 数组）。
   * 播放该 ID 的番剧时对应源权重增加 500。
   */
  sourceBangumiIds?: Record<string, number[]>
}
