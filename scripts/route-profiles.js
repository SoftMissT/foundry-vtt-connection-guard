import { MODULE_ID, SETTINGS, ROUTE_TYPES } from './constants.js'

/**
 * Perfis de rota do Abyss Link.
 *
 * O módulo não altera VPN, firewall, DNS, rota do SO, nem o endpoint ativo
 * do Foundry automaticamente. Ele mede URLs configuradas pelo GM e recomenda
 * o melhor caminho possível com base em evidência local de cada cliente.
 */

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
]

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function safeParseRouteProfiles(raw) {
  if (!raw || !String(raw).trim()) return []
  try {
    const parsed = JSON.parse(String(raw))
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeRouteProfile).filter(Boolean)
  } catch (err) {
    console.warn(`${MODULE_ID} | routeProfiles JSON inválido: ${err?.message ?? err}`)
    return []
  }
}

export function normalizeRouteProfile(profile, index = 0) {
  if (!profile || typeof profile !== 'object') return null

  const rawUrl = String(profile.url ?? '').trim()
  if (!rawUrl) return null

  const url = normalizeUrl(rawUrl)
  if (!url) return null

  const type = Object.values(ROUTE_TYPES).includes(profile.type)
    ? profile.type
    : classifyRouteType(url)

  return {
    id: sanitizeId(profile.id || `${type}-${index + 1}`),
    label: String(profile.label || labelForType(type)).slice(0, 64),
    type,
    url,
    requiresVpn: Boolean(profile.requiresVpn),
    priority: Number.isFinite(Number(profile.priority)) ? Number(profile.priority) : 10,
    notes: String(profile.notes ?? '').slice(0, 240),
  }
}

export function normalizeUrl(rawUrl) {
  try {
    const withProtocol = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
    const url = new URL(withProtocol)
    url.hash = ''
    return url.origin
  } catch {
    return null
  }
}

export function classifyRouteType(url) {
  try {
    const { hostname } = new URL(url)
    if (PRIVATE_HOST_PATTERNS.some(pattern => pattern.test(hostname))) return ROUTE_TYPES.LOCAL
    if (/radmin/i.test(hostname)) return ROUTE_TYPES.RADMIN
    if (/trycloudflare\.com$/i.test(hostname) || /cloudflare/i.test(hostname))
      return ROUTE_TYPES.CLOUDFLARE
    if (/playit\.gg$/i.test(hostname) || /joinplayit/i.test(hostname)) return ROUTE_TYPES.PLAYIT
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return ROUTE_TYPES.DIRECT
    return ROUTE_TYPES.CUSTOM
  } catch {
    return ROUTE_TYPES.CUSTOM
  }
}

export function labelForType(type) {
  switch (type) {
    case ROUTE_TYPES.LOCAL:
      return 'Local / LAN'
    case ROUTE_TYPES.RADMIN:
      return 'Radmin VPN'
    case ROUTE_TYPES.CLOUDFLARE:
      return 'Cloudflare Tunnel'
    case ROUTE_TYPES.PLAYIT:
      return 'playit.gg'
    case ROUTE_TYPES.DIRECT:
      return 'IP direto'
    default:
      return 'Rota custom'
  }
}

export function currentRouteProfile() {
  const url = window.location?.origin ?? ''
  const type = classifyRouteType(url)
  return {
    id: 'current',
    label: game.i18n?.localize?.('CONNGUARD.Route.Current') || 'Rota atual',
    type,
    url,
    requiresVpn: false,
    priority: 0,
    notes: 'Endpoint atualmente aberto no navegador.',
  }
}

export function getConfiguredRouteProfiles() {
  const raw = game.settings.get(MODULE_ID, SETTINGS.ROUTE_PROFILES)
  const configured = safeParseRouteProfiles(raw)
  const current = currentRouteProfile()

  const byUrl = new Map([[current.url, current]])
  for (const profile of configured) {
    if (!byUrl.has(profile.url)) byUrl.set(profile.url, profile)
  }

  return [...byUrl.values()].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  )
}

export function routeProfilesExample() {
  return JSON.stringify(
    [
      {
        id: 'lan-gm',
        label: 'LAN do Mestre',
        type: ROUTE_TYPES.LOCAL,
        url: 'http://192.168.0.10:30000',
        requiresVpn: false,
        priority: 1,
        notes: 'Use quando todos estão na mesma rede local.',
      },
      {
        id: 'radmin-vpn',
        label: 'Radmin VPN',
        type: ROUTE_TYPES.RADMIN,
        url: 'http://26.0.0.10:30000',
        requiresVpn: true,
        priority: 2,
        notes: 'Use quando todos estão na mesma rede Radmin.',
      },
      {
        id: 'cloudflare-main',
        label: 'Cloudflare Tunnel',
        type: ROUTE_TYPES.CLOUDFLARE,
        url: 'https://foundry.seudominio.com',
        requiresVpn: false,
        priority: 3,
        notes: 'Rota pública sem port-forward.',
      },
      {
        id: 'playit-main',
        label: 'playit.gg',
        type: ROUTE_TYPES.PLAYIT,
        url: 'https://seu-endpoint.playit.gg',
        requiresVpn: false,
        priority: 4,
        notes: 'Túnel público alternativo.',
      },
    ],
    null,
    2,
  )
}

function sanitizeId(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'route'
  )
}
