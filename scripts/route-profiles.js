import { MODULE_ID, SETTINGS, ROUTE_TYPES } from './constants.js'

/**
 * Perfis de rota do Abyss Link.
 *
 * O módulo não altera VPN, firewall, DNS, rota do SO, nem o endpoint ativo
 * do Foundry automaticamente. Ele mede URLs configuradas pelo GM e recomenda
 * o melhor caminho possível com base em evidência local de cada cliente.
 *
 * v3.0.5:
 * - Aceita JSON avançado OU lista simples de endpoints.
 * - Exemplo simples:
 *   softmisst.playit.plus:1051
 *   192.168.0.10:30000
 *   26.0.0.10:30000
 * - Detecta playit.plus como playit.gg.
 * - Sempre inclui automaticamente a rota atual aberta no navegador.
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
  const text = String(raw ?? '').trim()
  if (!text) return []

  const jsonProfiles = parseJsonProfiles(text)
  if (jsonProfiles.length) return jsonProfiles

  return parseSimpleRouteList(text)
}

function parseJsonProfiles(text) {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeRouteProfile).filter(Boolean)
  } catch {
    return []
  }
}

function parseSimpleRouteList(text) {
  return text
    .split(/[\n,;]/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((endpoint, index) =>
      normalizeRouteProfile({
        id: `auto-${index + 1}`,
        label: '',
        url: endpoint,
        priority: index + 1,
        notes: 'Rota adicionada por lista simples.',
      }),
    )
    .filter(Boolean)
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

  const label = String(profile.label || labelForType(type, url)).slice(0, 64)

  return {
    id: sanitizeId(profile.id || `${type}-${index + 1}`),
    label,
    type,
    url,
    requiresVpn: Boolean(profile.requiresVpn || type === ROUTE_TYPES.RADMIN),
    priority: Number.isFinite(Number(profile.priority)) ? Number(profile.priority) : 10,
    notes: String(profile.notes ?? '').slice(0, 240),
  }
}

export function normalizeUrl(rawUrl) {
  try {
    const trimmed = String(rawUrl ?? '').trim()
    if (!trimmed) return null

    const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    const protocol = window.location?.protocol === 'https:' ? 'https://' : 'http://'
    const withProtocol = hasProtocol ? trimmed : `${protocol}${trimmed}`

    const url = new URL(withProtocol)
    url.hash = ''
    url.pathname = ''
    url.search = ''
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
    if (/trycloudflare\.com$/i.test(hostname) || /cloudflare/i.test(hostname)) {
      return ROUTE_TYPES.CLOUDFLARE
    }
    if (
      /playit\.gg$/i.test(hostname) ||
      /playit\.plus$/i.test(hostname) ||
      /joinplayit/i.test(hostname)
    ) {
      return ROUTE_TYPES.PLAYIT
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return ROUTE_TYPES.DIRECT

    return ROUTE_TYPES.CUSTOM
  } catch {
    return ROUTE_TYPES.CUSTOM
  }
}

export function labelForType(type, url = '') {
  const host = hostLabel(url)

  switch (type) {
    case ROUTE_TYPES.LOCAL:
      return host ? `LAN / Local — ${host}` : 'LAN / Local'
    case ROUTE_TYPES.RADMIN:
      return host ? `Radmin VPN — ${host}` : 'Radmin VPN'
    case ROUTE_TYPES.CLOUDFLARE:
      return host ? `Cloudflare Tunnel — ${host}` : 'Cloudflare Tunnel'
    case ROUTE_TYPES.PLAYIT:
      return host ? `playit.gg — ${host}` : 'playit.gg'
    case ROUTE_TYPES.DIRECT:
      return host ? `IP direto — ${host}` : 'IP direto'
    default:
      return host ? `Rota custom — ${host}` : 'Rota custom'
  }
}

function hostLabel(url) {
  try {
    const parsed = new URL(url)
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname
  } catch {
    return ''
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

  const byUrl = new Map()

  if (current.url) byUrl.set(current.url, current)

  for (const profile of configured) {
    if (!profile?.url) continue
    if (!byUrl.has(profile.url)) byUrl.set(profile.url, profile)
  }

  return [...byUrl.values()].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  )
}

export function routeProfilesExample() {
  return [
    'Modo simples recomendado:',
    '',
    'softmisst.playit.plus:1051',
    '192.168.0.10:30000',
    '26.0.0.10:30000',
    'foundry.seudominio.com',
    '',
    'Ou, para controle avançado, use JSON:',
    JSON.stringify(
      [
        {
          id: 'playit-main',
          label: 'playit.gg principal',
          type: ROUTE_TYPES.PLAYIT,
          url: 'http://softmisst.playit.plus:1051',
          requiresVpn: false,
          priority: 1,
          notes: 'Endpoint público do playit.gg.',
        },
        {
          id: 'lan-gm',
          label: 'LAN do Mestre',
          type: ROUTE_TYPES.LOCAL,
          url: 'http://192.168.0.10:30000',
          requiresVpn: false,
          priority: 2,
          notes: 'Use quando todos estão na mesma rede local.',
        },
        {
          id: 'radmin-vpn',
          label: 'Radmin VPN',
          type: ROUTE_TYPES.RADMIN,
          url: 'http://26.0.0.10:30000',
          requiresVpn: true,
          priority: 3,
          notes: 'Use quando todos estão na mesma rede Radmin.',
        },
      ],
      null,
      2,
    ),
  ].join('\n')
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
