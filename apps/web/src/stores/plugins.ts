import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AdBlockerMode, PluginMeta, PluginRule, WeightContext } from '@animaku/shared'
import { parsePluginRule, comparePluginOrder, getPluginTotalWeight, isAnxRule } from '@animaku/shared'
import { DEFAULT_PLUGIN_RULES } from '../data/default-plugins'
import { migrateLocalStorageKey } from '../lib/storage'

migrateLocalStorageKey('animaku-plugins', [
  'aniku-plugins',
  'kazumi-web-plugins',
])

/** Bump when built-in rule set changes so empty/legacy stores re-seed */
/** v8: default adBlocker only on MXdm; Anime1/otage/xifan off */
/** v9: add omofun (211dm/omofuns) built-in */
/** v10: Anime1 last; HLS sources first */
/** v11: add pluginOrder for user-custom sorting */
/** v12: update built-in plugin rules (e.g. LIBVIO suggest API 403 -> xpath static search) */
/** v31: replace legacy adBlocker with adBlockerMode (none | client | server) */
/** v13: add xifan-next (next.xifanacg.com) built-in */
/** v14: fix xifan-next rule searchURL & searchMode definition */
/** v15: add weight to built-in rules (weight sorting > alphabetical; external rules default to lowest weight) */
/** v16: tune weights (xifan-next: 70, libvio/anime1: 60, mxdm: 55, default builtin: 50, external/third-party: 0) */
/** v17: reset legacy pluginOrder on defaults upgrade to enforce weight-first ordering */
/** v18: normalize all built-in plugin names and JSON files to lowercase */
/** v19: add preferOriginalTitle support (xifan-next, libvio, omofun prefer Japanese title) */
/** v20: add cycani (cycani.org) built-in */
/** v21: retire otage from default built-ins, set cycani weight to 70 */
/** v22: add tvtfun (tvtfun.net) built-in with weight 70 */
/** v23: add moonci (moonci.com) built-in with weight 65 */
/** v24: set moonci weight to 70 & preferOriginalTitle: true; tune cycani weight to 65 */
/** v25: tune default weights (xifan-next: 75, cycani: 70, moonci: 65, tvtfun: 65) */
/** v26: add oldAnimePriority for cycani & tvtfun to prioritize classic/vintage anime (airDate <= currentYear - 5) */
/** v27: retire anime1 & libvio from default built-ins to enforce pure zero-bandwidth CDN direct stream */
/** v28: add mifun & girigiri built-in rules with weight 70 & oldAnimePriority for girigiri */
/** v29: add lzizy (Apple CMS V10 JSON API + all categories + 0ms direct HLS) with weight 60 */
/** v30: upgrade title preference from preferOriginalTitle boolean to titlePreference enum ('chinese', 'chinese_compact', 'original', 'traditional') */
/** v32: tune default plugin weights (girigiri & mifun 70 > cycani 69, moonci 65 > tvtfun 64) and prioritize tvtfun road D */
/** v33: add animoe (animoe.org) built-in with weight 58 (below lzizy 59) */
/** v34: retire legacy xifan from default built-ins (superseded by xifan-next) */
/** v35: remove cycani oldAnimePriority */
/** v36: remove girigiri oldAnimePriority; moonci titlePreference chinese */
/** v37: tune weights (xifan-next: 66, moonci: 65, cycani/mifun: 61, girigiri: 60, tvtfun: 51) */
/** v38: tune girigiri weight to 55, fix mxdm relative xpath, omofun rank & unescape, xifan-next source_id */
/** v39: tune girigiri weight to 59 (same as lzizy) & restore cycani oldAnimePriority */
/** v40: add neosek (neosek.ai) built-in with weight 60 */
/** v41: add bimi (bimiacg14.net) built-in with weight 61 */
/** v42: add explicit iconUrl to built-in rules */
/** v43: add akianime (akianime.cc) built-in with weight 58 & tune source weights */
/** v44: add huazi (huazidm.com) built-in with weight 58 (same as akianime) */
/** v45: add jzacg (jzacg.com) built-in with weight 58 */
/** v46: disable tvtfun by default due to upstream turnstile captcha */
/** v47: refactor plugin sorting to unified score weight model */
export const PLUGIN_DEFAULTS_VERSION = 47

interface PluginState {
  plugins: PluginMeta[]
  /** version of built-in defaults last applied (0 = never / legacy empty) */
  defaultsVersion: number
  /** User-defined weight offsets for plugins (key is lowercase plugin name). */
  userPluginWeights: Record<string, number>
  /** User-defined display order of plugin names for backwards compatibility. */
  pluginOrder: string[]
  importRule: (
    raw: unknown,
    opts?: { source?: PluginMeta['source']; enabled?: boolean },
  ) => PluginMeta
  removePlugin: (id: string) => void
  togglePlugin: (id: string, enabled?: boolean) => void
  /** Per-rule HLS ad filter mode */
  setPluginAdBlockerMode: (id: string, adBlockerMode: AdBlockerMode) => void
  /** Per-rule media proxy toggle */
  setPluginProxy: (id: string, proxy: boolean) => void
  /** Set individual plugin user weight offset */
  setPluginWeight: (name: string, weight: number) => void
  /** Reorder plugins by assigned list: assigns descending weight offsets in steps of 1000 */
  reorderPlugins: (orderedNames: string[]) => void
  /** Pin a plugin to the absolute top position */
  pinPluginToTop: (name: string) => void
  /** Reset user weights back to site/official defaults */
  resetWeightsToDefault: () => void
  /** Compatibility alias: reorder plugins */
  setPluginOrder: (order: string[]) => void
  /** Get enabled plugins sorted by total score */
  getEnabled: (ctx?: WeightContext) => PluginMeta[]
  getByName: (name: string) => PluginMeta | undefined
  /** If store is empty, write built-in rules (safe to call often) */
  ensureDefaults: () => void
  resetToDefaults: () => void
}

function toMeta(
  rule: PluginRule,
  source: PluginMeta['source'] = 'import',
  enabled = true,
): PluginMeta {
  const baseKey = (rule.id || rule.name).trim()
  const rawRule = rule as unknown as { enabled?: boolean }
  const effectiveEnabled = typeof rawRule.enabled === 'boolean' ? rawRule.enabled : enabled
  return {
    ...rule,
    id: `${baseKey}-${source}`,
    enabled: effectiveEnabled,
    proxy: rule.requiresFullMediaProxy === true ? true : undefined,
    importedAt: Date.now(),
    source,
    engineType: isAnxRule(rule) ? 'animaku' : 'adapter',
  }
}

export function seedFromDefaults(): PluginMeta[] {
  const list = DEFAULT_PLUGIN_RULES.map((raw) => {
    const rawObj = raw as { enabled?: boolean; name?: string }
    const defaultEnabled = rawObj.enabled ?? true
    try {
      return toMeta(parsePluginRule(raw), 'builtin', defaultEnabled)
    } catch {
      return toMeta(raw as PluginRule, 'builtin', defaultEnabled)
    }
  }).filter(
      (p) =>
        p.name &&
        p.baseURL &&
        (p.searchURL || p.searchMode === 'api' || p.searchApiConfig),
    )
  if (!list.length) {
    console.warn('[plugins] DEFAULT_PLUGIN_RULES produced empty list')
  }
  return [...list].sort(comparePluginOrder)
}

const BUILTIN_NAMES = new Set(
  DEFAULT_PLUGIN_RULES.map((r) => (r.name || '').toLowerCase()),
)

export function isBuiltinPlugin(plugin: PluginMeta): boolean {
  if (plugin.source === 'builtin') return true
  if (plugin.source === 'import') return false
  const id = (plugin.id || '').toLowerCase()
  if (id.endsWith('-builtin')) return true
  if (
    id.endsWith('-animaku') ||
    id.endsWith('-anibaka') ||
    id.endsWith('-kazumi') ||
    id.endsWith('-import')
  ) {
    return false
  }
  if (plugin.name && BUILTIN_NAMES.has(plugin.name.toLowerCase())) return true
  return false
}

/**
 * Default plugin order: weight descending > alphabetical by name.
 * Used as fallback when user has no custom `pluginOrder`.
 */
export function defaultPluginOrder(plugins: PluginMeta[]): string[] {
  const sorted = [...plugins].sort(comparePluginOrder)
  const seen = new Set<string>()
  const result: string[] = []
  for (const p of sorted) {
    const key = p.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(p.name)
    }
  }
  return result
}

function normalizePlugins(raw: unknown): PluginMeta[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (p): p is PluginMeta =>
      Boolean(p && typeof p === 'object' && typeof (p as PluginMeta).name === 'string'),
  )
}

export function mergeOrderWithNewPlugins(
  order: string[],
  allPlugins: PluginMeta[],
): string[] {
  if (!order.length) return allPlugins.map((p) => p.name)
  return order
}

export function sortByOrder(
  plugins: PluginMeta[],
  _order?: string[],
  ctx?: WeightContext,
): PluginMeta[] {
  return [...plugins].sort((a, b) => comparePluginOrder(a, b, ctx))
}

function getSiteDefaultPluginsConfig(): {
  pluginOrder?: string[]
  pluginWeights?: Record<string, number>
  disabledPlugins?: string[]
  pluginOldAnimePriority?: Record<string, boolean>
} | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem('animaku-site-config-cache')
    if (raw) {
      const parsed = JSON.parse(raw) as {
        defaultSettings?: {
          pluginOrder?: string[]
          pluginWeights?: Record<string, number>
          disabledPlugins?: string[]
          pluginOldAnimePriority?: Record<string, boolean>
        }
      }
      return parsed.defaultSettings || null
    }
  } catch {}
  return null
}

export function seedFromDefaultsWithSiteOverrides(): {
  plugins: PluginMeta[]
  pluginWeights: Record<string, number>
  pluginOrder: string[]
} {
  let plugins = seedFromDefaults()
  const d = getSiteDefaultPluginsConfig()
  if (d?.disabledPlugins && Array.isArray(d.disabledPlugins)) {
    const disabledSet = new Set(d.disabledPlugins.map((n) => n.toLowerCase()))
    plugins = plugins.map((p) => ({
      ...p,
      enabled: !disabledSet.has(p.name.toLowerCase()),
    }))
  }
  if (d?.pluginOldAnimePriority && typeof d.pluginOldAnimePriority === 'object') {
    plugins = plugins.map((p) => {
      const key = p.name.toLowerCase()
      if (typeof d.pluginOldAnimePriority![key] === 'boolean') {
        return {
          ...p,
          oldAnimePriority: d.pluginOldAnimePriority![key],
        }
      }
      return p
    })
  }
  const pluginWeights =
    d?.pluginWeights && typeof d.pluginWeights === 'object' ? d.pluginWeights : {}
  const pluginOrder = plugins.map((p) => p.name)
  return { plugins, pluginWeights, pluginOrder }
}

export const usePluginStore = create<PluginState>()(
  persist(
    (set, get) => ({
      plugins: seedFromDefaultsWithSiteOverrides().plugins,
      defaultsVersion: PLUGIN_DEFAULTS_VERSION,
      userPluginWeights: {},
      pluginOrder: [],
      importRule: (raw, opts) => {
        const rule = parsePluginRule(raw)
        const meta = toMeta(
          rule,
          opts?.source ?? 'import',
          opts?.enabled ?? true,
        )
        set((s) => {
          const prev = normalizePlugins(s.plugins)
          const existing = prev.find(
            (p) => p.id.toLowerCase() === meta.id.toLowerCase(),
          )
          if (existing && opts?.enabled === undefined) {
            meta.enabled = existing.enabled
          }
          const rest = prev.filter(
            (p) => p.id.toLowerCase() !== meta.id.toLowerCase(),
          )
          return {
            plugins: [meta, ...rest],
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
          }
        })
        return meta
      },
      removePlugin: (id) =>
        set((s) => {
          const plugin = normalizePlugins(s.plugins).find((p) => p.id === id)
          if (plugin && isBuiltinPlugin(plugin)) return s
          const remaining = normalizePlugins(s.plugins).filter((p) => p.id !== id)
          const nextWeights = { ...(s.userPluginWeights || {}) }
          if (plugin?.name) {
            delete nextWeights[plugin.name.toLowerCase()]
          }
          return {
            plugins: remaining,
            userPluginWeights: nextWeights,
          }
        }),
      togglePlugin: (id, enabled) =>
        set((s) => ({
          plugins: normalizePlugins(s.plugins).map((p) =>
            p.id === id ? { ...p, enabled: enabled ?? !p.enabled } : p,
          ),
        })),
      setPluginAdBlockerMode: (id, adBlockerMode) =>
        set((s) => ({
          plugins: normalizePlugins(s.plugins).map((p) =>
            p.id === id ? { ...p, adBlockerMode } : p,
          ),
        })),
      setPluginProxy: (id, proxy) =>
        set((s) => ({
          plugins: normalizePlugins(s.plugins).map((p) =>
            p.id === id ? { ...p, proxy } : p,
          ),
        })),
      setPluginWeight: (name, weight) =>
        set((s) => ({
          userPluginWeights: {
            ...(s.userPluginWeights || {}),
            [name.toLowerCase()]: weight,
          },
        })),
      reorderPlugins: (orderedNames) =>
        set((s) => {
          const weights: Record<string, number> = {}
          const step = 1000
          const total = orderedNames.length
          orderedNames.forEach((name, index) => {
            weights[name.toLowerCase()] = (total - index) * step
          })
          return {
            userPluginWeights: weights,
            pluginOrder: orderedNames,
          }
        }),
      pinPluginToTop: (name) => {
        const key = name.toLowerCase()
        const enabled = normalizePlugins(get().plugins).filter(
          (p) => p.enabled !== false,
        )
        const currentSorted = [...enabled].sort((a, b) =>
          comparePluginOrder(a, b, { userWeights: get().userPluginWeights }),
        )
        const orderedNames = [
          name,
          ...currentSorted.map((p) => p.name).filter((n) => n.toLowerCase() !== key),
        ]
        get().reorderPlugins(orderedNames)
      },
      resetWeightsToDefault: () =>
        set({
          userPluginWeights: {},
          pluginOrder: [],
        }),
      setPluginOrder: (order) => {
        get().reorderPlugins(order.filter(Boolean))
      },
      getEnabled: (ctx) => {
        const enabled = normalizePlugins(get().plugins).filter(
          (p) => p.enabled !== false,
        )
        const userWeights = get().userPluginWeights || {}
        const mergedCtx: WeightContext = {
          userWeights,
          ...(ctx || {}),
        }
        return [...enabled].sort((a, b) => comparePluginOrder(a, b, mergedCtx))
      },
      getByName: (name) => {
        const key = name.toLowerCase()
        return normalizePlugins(get().plugins).find(
          (p) => p.name.toLowerCase() === key,
        )
      },
      ensureDefaults: () => {
        const plugins = normalizePlugins(get().plugins)
        const ver = get().defaultsVersion ?? 0
        if (plugins.length === 0) {
          const seeded = seedFromDefaultsWithSiteOverrides()
          set({
            plugins: seeded.plugins,
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            userPluginWeights: {},
            pluginOrder: [],
          })
          return
        }
        if (ver >= PLUGIN_DEFAULTS_VERSION) {
          const seedByName = new Map(
            seedFromDefaults().map((p) => [p.name.toLowerCase(), p]),
          )
          const have = new Set(plugins.map((p) => p.name.toLowerCase()))
          const missing = seedFromDefaults().filter(
            (p) => !have.has(p.name.toLowerCase()),
          )
          let changed = missing.length > 0
          let next = plugins.map((p) => {
            if (p.source !== 'builtin' && p.source !== undefined) return p
            const seed = seedByName.get(p.name.toLowerCase())
            if (!seed) return p
            if (
              p.weight !== seed.weight ||
              p.titlePreference !== seed.titlePreference ||
              p.oldAnimePriority !== seed.oldAnimePriority ||
              p.iconUrl !== seed.iconUrl
            ) {
              changed = true
              return {
                ...p,
                weight: seed.weight,
                titlePreference: seed.titlePreference,
                oldAnimePriority: seed.oldAnimePriority,
                iconUrl: seed.iconUrl,
              }
            }
            return p
          })
          if (missing.length) next = [...next, ...missing]
          const curOrder = get().pluginOrder || []
          const mergedOrder = curOrder.length > 0 ? mergeOrderWithNewPlugins(curOrder, next) : curOrder
          if (changed || mergedOrder.length !== curOrder.length) {
            next = next.sort(comparePluginOrder)
            set({
              plugins: next,
              defaultsVersion: PLUGIN_DEFAULTS_VERSION,
              pluginOrder: mergedOrder,
            })
          }
          return
        }

        // Replace legacy default-only stores with current defaults.
        // v6: drop 7sefun from defaults, add ose (MacCMS / plaintext m3u8).
        // v7: add xifan (稀饭 MacCMS; suggest API search + player_aaaa).
        // v8: adBlocker defaults — only MXdm on among built-ins.
        // v9: add omofun (211dm / omofuns).
        // v10: Anime1 last.
        // v11: pluginOrder for user sort.
        // v12: update built-in plugin rules (e.g. LIBVIO searchMode api -> xpath).
        // v13: add xifan-next (next.xifanacg.com).
        // v14: fix xifan-next rule searchURL & searchMode definition.
        // v15: add weight to built-in rules (weight sorting > alphabetical; external rules default to lowest weight).
        // v16: tune weights (xifan-next: 70, libvio/anime1: 60, mxdm: 55, default builtin: 50, external/third-party: 0).
        // v17: reset legacy pluginOrder on defaults upgrade to enforce weight-first ordering.
        // v20: add cycani (cycani.org).
        const legacyBuiltinNames = new Set(
          [
            '7sefun',
            'dm84',
            'enlie',
            'age',
            'gugu3',
            'mxdm',
            'anime1',
            'otage',
            'xifan',
            'xifan-next',
            'omofun',
            'libvio',
            'cycani',
            'tvtfun',
            'moonci',
            'mifun',
            'girigiri',
            'lzizy',
            'animoe',
            'neosek',
            'bimi',
            'akianime',
            'huazi',
            'jzacg',
          ].map((s) => s.toLowerCase()),
        )
        const onlyLegacyBuiltins = plugins.every(
          (p) =>
            p.source === 'builtin' ||
            legacyBuiltinNames.has(p.name.toLowerCase()),
        )
        if (onlyLegacyBuiltins) {
          const seeded = seedFromDefaultsWithSiteOverrides()
          set({
            plugins: seeded.plugins,
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            userPluginWeights: {},
            pluginOrder: seeded.pluginOrder,
          })
          return
        }
        // Mixed store: add any new built-ins; drop retired default 7sefun/otage
        // only when it was backend marked builtin (user re-import keeps source=import).
        // Also align *builtin* rule definitions and adBlocker/proxy flags to current
        // DEFAULT_PLUGIN_RULES without overwriting user-imported rules.
        const seedByName = new Map(
          seedFromDefaults().map((p) => [p.name.toLowerCase(), p]),
        )
        const have = new Set(plugins.map((p) => p.name.toLowerCase()))
        const missing = seedFromDefaults().filter(
          (p) => !have.has(p.name.toLowerCase()),
        )
        let next = plugins.filter(
          (p) =>
            !(
              (p.name.toLowerCase() === '7sefun' ||
                p.name.toLowerCase() === 'otage' ||
                p.name.toLowerCase() === 'anime1' ||
                p.name.toLowerCase() === 'libvio') &&
              (p.source === 'builtin' || p.source === undefined)
            ),
        )
        next = next.map((p) => {
          if (p.source !== 'builtin' && p.source !== undefined) return p
          const seed = seedByName.get(p.name.toLowerCase())
          if (!seed) return p
          const isTvtfun = p.name.toLowerCase() === 'tvtfun'
          const enabled = isTvtfun && ver < 46 ? false : (p.enabled ?? seed.enabled)
          return {
            ...seed,
            enabled,
            adBlockerMode: p.adBlockerMode ?? seed.adBlockerMode ?? 'none',
            proxy: p.proxy ?? (seed.requiresFullMediaProxy === true ? true : undefined),
            importedAt: p.importedAt ?? seed.importedAt,
          }
        })
        if (missing.length) next = [...next, ...missing]
        next = next.sort(comparePluginOrder)
        const curOrder = get().pluginOrder || []
        const mergedOrder =
          curOrder.length > 0 ? mergeOrderWithNewPlugins(curOrder, next) : curOrder
        set({
          plugins: next,
          defaultsVersion: PLUGIN_DEFAULTS_VERSION,
          pluginOrder: mergedOrder,
        })
      },
      resetToDefaults: () => {
        const seeded = seedFromDefaultsWithSiteOverrides()
        set({
          plugins: seeded.plugins,
          defaultsVersion: PLUGIN_DEFAULTS_VERSION,
          userPluginWeights: {},
          pluginOrder: seeded.pluginOrder,
        })
      },
    }),
    {
      name: 'animaku-plugins',
      version: 2,
      storage: createJSONStorage(() =>
        typeof localStorage !== 'undefined'
          ? localStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (s) => ({
        plugins: s.plugins,
        defaultsVersion: s.defaultsVersion,
        userPluginWeights: s.userPluginWeights,
        pluginOrder: s.pluginOrder,
      }),
      migrate: (persisted, fromVersion) => {
        const p = (persisted || {}) as {
          plugins?: unknown
          defaultsVersion?: number
          _seeded?: boolean
          pluginOrder?: string[]
        }
        let plugins = normalizePlugins(p.plugins)
        const wasEmpty = plugins.length === 0
        // v0 / legacy empty list → seed
        if (wasEmpty || fromVersion < 1) {
          if (wasEmpty) plugins = seedFromDefaults()
        }
        const persistedVer =
          typeof p.defaultsVersion === 'number' && Number.isFinite(p.defaultsVersion)
            ? p.defaultsVersion
            : 0
        // Preserve version so ensureDefaults can migrate builtins; only stomp
        // current when we just seeded an empty store.
        return {
          plugins,
          defaultsVersion: wasEmpty ? PLUGIN_DEFAULTS_VERSION : persistedVer,
        }
      },
      merge: (persisted, current) => {
        if (persisted == null) {
          return {
            ...current,
            plugins: seedFromDefaults(),
            defaultsVersion: PLUGIN_DEFAULTS_VERSION,
            pluginOrder: [],
          }
        }
        const p = persisted as Partial<PluginState> & { _seeded?: boolean }
        let plugins = normalizePlugins(p.plugins)
        // Empty after rehydrate (old empty localStorage) → seed
        const wasEmpty = plugins.length === 0
        if (wasEmpty) {
          plugins = seedFromDefaults()
        }
        // One-time default: full-proxy sources get proxy=true when unset.
        plugins = plugins.map((pl) =>
          pl.proxy === undefined && pl.requiresFullMediaProxy === true
            ? { ...pl, proxy: true }
            : pl,
        )
        const persistedVer =
          typeof p.defaultsVersion === 'number' && Number.isFinite(p.defaultsVersion)
            ? p.defaultsVersion
            : 0
        return {
          ...current,
          plugins,
          defaultsVersion: wasEmpty ? PLUGIN_DEFAULTS_VERSION : persistedVer,
          userPluginWeights:
            p.userPluginWeights && typeof p.userPluginWeights === 'object'
              ? p.userPluginWeights
              : {},
          pluginOrder: Array.isArray(p.pluginOrder) ? p.pluginOrder : [],
        }
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[plugins] rehydrate failed', error)
        }
        // Always fix empty after rehydrate
        state?.ensureDefaults()
      },
    },
  ),
)

/** Call once at app boot so empty localStorage is fixed before any page reads store */
export function bootstrapPlugins() {
  try {
    usePluginStore.persist.rehydrate?.()
  } catch {
    /* ignore */
  }
  usePluginStore.getState().ensureDefaults()
}
