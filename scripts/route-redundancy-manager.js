import {
  MODULE_ID,
  SETTINGS,
  DEFAULTS,
  JOURNAL_TYPES,
  ROUTE_TYPES,
  REDUNDANCY_PRIMARY_TYPES,
} from './constants.js'
import { getActiveRoute } from './route-profiles.js'

/**
 * RouteRedundancyManager — redundância de conexão com fallback Radmin.
 *
 * Tarefa 2 (fechada): configuração, modos, detecção de rota, estado inicial.
 * Tarefa 3 (fechada): timer + eventos de conexão + decisão de failover.
 * Tarefa 4 (esta): execução segura do redirect para Radmin.
 *
 * RADMIN_FAILOVER → construção de URL segura → location.replace() UMA vez.
 * Sem failback automático (estando no Radmin, PRIMARY voltar não devolve);
 * sem health-check; sem transporte de cookie/sessionId/token/senha na URL.
 *
 * Regra absoluta: o failover só é armado quando
 *   mode === PRIMARY_PLUS_RADMIN && currentRoute === PRIMARY
 *
 * Nenhuma lógica de timer/socket/redirect fica fora deste arquivo. Nenhum
 * acesso a game/window/foundry/ui no top-level — as funções puras rodam
 * fora do Foundry (Node) sem quebrar o import.
 */

export const REDUNDANCY_MODES = {
  RADMIN_ONLY: 'RADMIN_ONLY',
  PRIMARY_ONLY: 'PRIMARY_ONLY',
  PRIMARY_PLUS_RADMIN: 'PRIMARY_PLUS_RADMIN',
  UNSUPPORTED: 'UNSUPPORTED',
}

export const REDUNDANCY_STATES = {
  IDLE: 'IDLE',
  PRIMARY_CONNECTED: 'PRIMARY_CONNECTED',
  RADMIN_CONNECTED: 'RADMIN_CONNECTED',
  PRIMARY_RETRYING: 'PRIMARY_RETRYING',
  RADMIN_FAILOVER: 'RADMIN_FAILOVER',
}

export const CURRENT_ROUTES = {
  PRIMARY: 'primary',
  RADMIN: 'radmin',
  NONE: 'none',
}

const MIN_FAILOVER_TIMEOUT_SECONDS = 10
const MAX_FAILOVER_TIMEOUT_SECONDS = 120

/** Interpreta REDUNDANCY_CONFIG (string JSON) sem lançar exceção. */
export function safeParseRedundancy(raw) {
  const direct = normalizeRedundancy(raw)
  if (direct) return direct

  const text = String(raw ?? '').trim()
  if (!text) return { enabled: false, radminUrl: '' }

  try {
    return normalizeRedundancy(JSON.parse(text)) ?? { enabled: false, radminUrl: '' }
  } catch {
    return { enabled: false, radminUrl: '' }
  }
}

function normalizeRedundancy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return {
    enabled: value.enabled === true,
    radminUrl: typeof value.radminUrl === 'string' ? value.radminUrl : '',
  }
}

/** Parse seguro de URL absoluta; retorna URL ou null. Nunca lança. */
function safeUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  try {
    return new URL(text)
  } catch {
    return null
  }
}

/**
 * Origem http/https de uma URL, ou null se inválida. Nunca lança.
 * A comparação de rotas usa somente origins normalizadas.
 */
function originOf(value) {
  const parsed = safeUrl(value)
  if (!parsed) return null
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  return parsed.origin
}

/**
 * Valida URL de fallback Radmin. Requisitos:
 * 1. parse seguro (URL absoluta http/https — inválida lança TypeError);
 * 2. somente protocolo http: ou https:;
 * 3. hostname é IPv4 válido (quatro octetos 0-255);
 * 4. primeiro octeto igual a 26;
 * 5. sem username/password;
 * 6. pathname exatamente "/" (a config representa somente a ORIGIN);
 * 7. sem querystring;
 * 8. sem hash.
 * Nunca lança.
 */
export function isValidRadminUrl(value) {
  const parsed = safeUrl(value)
  if (!parsed) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  if (parsed.pathname !== '/') return false
  if (parsed.search) return false
  if (parsed.hash) return false
  return isValidRadminHostname(parsed.hostname)
}

function isValidRadminHostname(hostname) {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts[0] !== '26') return false
  return parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false
    const octet = Number(part)
    return Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === part
  })
}

/** Origem normalizada da URL Radmin, ou null se inválida. */
function radminOrigin(value) {
  return isValidRadminUrl(value) ? originOf(value) : null
}

/**
 * Constrói a URL de redirect para o Radmin a partir da URL atual do
 * navegador. Usa a ORIGIN do Radmin e preserva SOMENTE o pathname atual
 * (routePrefix do Foundry). NÃO transporta search/query nem hash.
 * Retorna null se qualquer validação falhar. Nunca lança.
 * Não preserva sessão entre origins — nunca anexa credenciais.
 */
export function buildFailoverRedirectUrl(currentHref, radminUrl) {
  try {
    const current = safeUrl(currentHref)
    if (!current) return null
    if (current.protocol !== 'http:' && current.protocol !== 'https:') return null
    if (!current.hostname) return null

    const radmin = safeUrl(radminUrl)
    if (!radmin) return null
    if (!isValidRadminUrl(radminUrl)) return null

    const target = new URL(radmin.origin)
    target.pathname = current.pathname
    return target.toString()
  } catch {
    return null
  }
}

/**
 * Determina o modo de operação a partir da rota ativa e da configuração
 * de redundância. A redundância existe apenas para rotas primárias
 * (cloudflare, ngrok, playit) com enabled === true E radminUrl válida.
 */
export function resolveRedundancyMode(activeRoute, redundancy = {}) {
  const route = activeRoute && typeof activeRoute === 'object' ? activeRoute : null

  if (!route?.type) return REDUNDANCY_MODES.UNSUPPORTED
  if (route.type === ROUTE_TYPES.RADMIN) return REDUNDANCY_MODES.RADMIN_ONLY
  if (!REDUNDANCY_PRIMARY_TYPES.includes(route.type)) return REDUNDANCY_MODES.UNSUPPORTED

  const redundancySafe = safeParseRedundancy(redundancy)
  if (redundancySafe.enabled !== true) return REDUNDANCY_MODES.PRIMARY_ONLY

  // PRIMARY e FALLBACK precisam ser origins realmente distintas:
  // se coincidem não existe redundância (PRIMARY === RADMIN → UNSUPPORTED).
  const primaryOrigin = originOf(route.url)
  const radmin = radminOrigin(redundancySafe.radminUrl)
  if (!primaryOrigin || !radmin || primaryOrigin === radmin) {
    return REDUNDANCY_MODES.UNSUPPORTED
  }

  return REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN
}

/**
 * Detecta a rota runtime atual comparando a origem do navegador com as
 * origins configuradas (rota ativa/primária e Radmin).
 *
 *   currentOrigin === primaryOrigin → PRIMARY
 *   currentOrigin === radminOrigin  → RADMIN
 *   nenhum dos dois                 → NONE
 *
 * Sempre exige uma correspondência explícita — nunca assume
 * "não é Radmin = primary". Nunca usa storage, cookie, sessionId ou token.
 */
export function resolveCurrentRoute(mode, currentOrigin, primaryUrl = '', radminUrl = '') {
  const current = originOf(currentOrigin)

  switch (mode) {
    case REDUNDANCY_MODES.RADMIN_ONLY:
      // A rota ativa é a própria radmin; compara com a origem dela.
      return current && current === originOf(primaryUrl)
        ? CURRENT_ROUTES.RADMIN
        : CURRENT_ROUTES.NONE
    case REDUNDANCY_MODES.PRIMARY_ONLY:
      return current && current === originOf(primaryUrl)
        ? CURRENT_ROUTES.PRIMARY
        : CURRENT_ROUTES.NONE
    case REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN: {
      const primary = originOf(primaryUrl)
      const radmin = radminOrigin(radminUrl)
      if (current && radmin && current === radmin) return CURRENT_ROUTES.RADMIN
      if (current && primary && current === primary) return CURRENT_ROUTES.PRIMARY
      return CURRENT_ROUTES.NONE
    }
    default:
      return CURRENT_ROUTES.NONE
  }
}

/**
 * Estado inicial coerente a partir da rota detectada. Mesmo em
 * PRIMARY_PLUS_RADMIN, uma origem que não corresponde a nenhuma rota
 * configurada resulta em IDLE.
 */
export function initialStateFor(_mode, currentRoute) {
  switch (currentRoute) {
    case CURRENT_ROUTES.PRIMARY:
      return REDUNDANCY_STATES.PRIMARY_CONNECTED
    case CURRENT_ROUTES.RADMIN:
      return REDUNDANCY_STATES.RADMIN_CONNECTED
    default:
      return REDUNDANCY_STATES.IDLE
  }
}

export class RouteRedundancyManager {
  #mode = REDUNDANCY_MODES.UNSUPPORTED
  #state = REDUNDANCY_STATES.IDLE
  #currentRoute = CURRENT_ROUTES.NONE
  #activeRoute = null
  #redundancy = { enabled: false, radminUrl: '' }
  #journal = null
  #started = false
  #failoverTimer = null
  #disconnectHandler = null
  #connectHandler = null
  #onlineHandler = null
  #offlineHandler = null
  #redirectIssued = false

  constructor(journal = null) {
    this.#journal = journal
  }

  /** Lê a configuração, resolve o estado inicial e registra no journal. */
  initialize() {
    this.#readConfig()
    this.#resolveInitialState()
    this.#logStartup()
    return this
  }

  /**
   * Registra recursos de runtime (socket + rede). Idempotente.
   * Só consome recursos quando o failover se aplica: PRIMARY_PLUS_RADMIN
   * com currentRoute === PRIMARY. Nos demais modos/rotas o runtime fica OFF
   * (0 listeners) — o manager ainda expõe mode/state/currentRoute.
   */
  start() {
    if (this.#started) return this
    if (!this.#isFailoverEligible()) return this

    this.#started = true
    this.#bindSocketListeners()
    this.#bindNetworkListeners()

    return this
  }

  /**
   * Remove listeners e limpa o timer. Chamado duas vezes não gera erro.
   * O failover só arma o timer em PRIMARY_PLUS_RADMIN + PRIMARY; em
   * RADMIN_ONLY / PRIMARY_ONLY / UNSUPPORTED / RADMIN / NONE fica inativo.
   */
  stop() {
    this.#cancelFailoverTimer()
    const socket = game.socket
    if (socket) {
      if (this.#disconnectHandler) socket.off('disconnect', this.#disconnectHandler)
      if (this.#connectHandler) socket.off('connect', this.#connectHandler)
    }
    if (this.#onlineHandler) window.removeEventListener('online', this.#onlineHandler)
    if (this.#offlineHandler) window.removeEventListener('offline', this.#offlineHandler)
    this.#disconnectHandler = null
    this.#connectHandler = null
    this.#onlineHandler = null
    this.#offlineHandler = null
    this.#started = false
    return this
  }

  get mode() {
    return this.#mode
  }

  get state() {
    return this.#state
  }

  get currentRoute() {
    return this.#currentRoute
  }

  isRedundancyActive() {
    return this.#mode === REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN
  }

  #readConfig() {
    this.#activeRoute = getActiveRoute()
    this.#redundancy = safeParseRedundancy(game.settings.get(MODULE_ID, SETTINGS.REDUNDANCY_CONFIG))
  }

  #resolveInitialState() {
    this.#mode = resolveRedundancyMode(this.#activeRoute, this.#redundancy)
    const origin = globalThis.location?.origin ?? ''
    this.#currentRoute = resolveCurrentRoute(
      this.#mode,
      origin,
      this.#activeRoute?.url ?? '',
      this.#redundancy.radminUrl,
    )
    this.#state = initialStateFor(this.#mode, this.#currentRoute)
  }

  #logStartup() {
    this.#journal?.log(JOURNAL_TYPES.LIFECYCLE, {
      message: 'RouteRedundancyManager inicializado',
      mode: this.#mode,
      state: this.#state,
      currentRoute: this.#currentRoute,
      redundancyActive: this.isRedundancyActive(),
    })
  }

  #bindSocketListeners() {
    const socket = game.socket
    if (!socket) return
    this.#disconnectHandler = () => this.#onDisconnect()
    this.#connectHandler = () => this.#onConnect()
    socket.on('disconnect', this.#disconnectHandler)
    socket.on('connect', this.#connectHandler)
  }

  #bindNetworkListeners() {
    this.#onlineHandler = () => this.#onOnline()
    this.#offlineHandler = () => this.#onOffline()
    window.addEventListener('online', this.#onlineHandler)
    window.addEventListener('offline', this.#offlineHandler)
  }

  #onDisconnect() {
    if (!this.#isFailoverEligible()) return

    // Browser explicitamente offline: o túnel público pode estar vivo;
    // não concluir que a PRIMARY morreu. Sem timer de failover.
    if (navigator.onLine === false) {
      this.#cancelFailoverTimer()
      this.#setState(REDUNDANCY_STATES.PRIMARY_RETRYING)
      return
    }

    this.#setState(REDUNDANCY_STATES.PRIMARY_RETRYING)
    this.#armFailoverTimer()
  }

  #onConnect() {
    this.#cancelFailoverTimer()

    // Ainda na origin PRIMARY e sem redirect: reconexão volta ao normal,
    // mesmo que o estado estivesse em RADMIN_FAILOVER (nenhum redirect
    // aconteceu). Não é failback — o cliente nunca saiu da PRIMARY.
    if (
      this.#mode === REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN &&
      this.#currentRoute === CURRENT_ROUTES.PRIMARY
    ) {
      this.#setState(REDUNDANCY_STATES.PRIMARY_CONNECTED)
    }
  }

  #onOffline() {
    this.#cancelFailoverTimer()
    // Mantém PRIMARY_RETRYING; o timer volta quando o browser voltar online.
  }

  #onOnline() {
    const socket = game.socket
    if (!socket || socket.connected !== false) return
    if (!this.#isFailoverEligible()) return
    this.#setState(REDUNDANCY_STATES.PRIMARY_RETRYING)
    this.#armFailoverTimer()
  }

  #onTimerExpired() {
    this.#failoverTimer = null

    // Revalidar tudo — não confiar no estado de 30s atrás.
    if (!this.#isFailoverEligible()) return
    if (navigator.onLine === false) return

    const socket = game.socket
    if (!socket || socket.connected !== false) {
      // O socket voltou durante a espera: nada de failover.
      this.#setState(REDUNDANCY_STATES.PRIMARY_CONNECTED)
      return
    }

    this.#setState(REDUNDANCY_STATES.RADMIN_FAILOVER)
    this.#journal?.log(JOURNAL_TYPES.CONNECTION, {
      event: 'radmin-failover',
      mode: this.#mode,
      currentRoute: this.#currentRoute,
    })
    this.#executeFailoverRedirect()
  }

  /**
   * Executa UMA navegação segura para o Radmin. Revalida tudo de novo —
   * nada é confiado ao estado de momentos atrás. Usa location.replace()
   * para que "Voltar" não devolva o jogador à PRIMARY que acabou de falhar.
   * Sem loop: #redirectIssued impede qualquer segunda tentativa automática.
   */
  #executeFailoverRedirect() {
    if (this.#redirectIssued) return
    if (!this.#isFailoverEligible()) return
    if (this.#state !== REDUNDANCY_STATES.RADMIN_FAILOVER) return
    if (navigator.onLine === false) return

    const socket = game.socket
    if (!socket || socket.connected !== false) return

    const primaryOrigin = originOf(this.#activeRoute?.url)
    const currentOrigin = globalThis.location?.origin ?? ''
    if (!primaryOrigin || currentOrigin !== primaryOrigin) return

    const targetUrl = buildFailoverRedirectUrl(
      globalThis.location?.href ?? '',
      this.#redundancy.radminUrl,
    )
    if (!targetUrl) {
      this.#journal?.log(JOURNAL_TYPES.ERROR, {
        event: 'failover-redirect-blocked',
        reason: 'url-build-failed',
      })
      return
    }

    this.#redirectIssued = true
    try {
      globalThis.location.replace(targetUrl)
      this.#journal?.log(JOURNAL_TYPES.CONNECTION, {
        event: 'failover-redirect',
        targetUrl,
      })
    } catch (err) {
      // Sem loop e sem nova tentativa automática.
      this.#journal?.log(JOURNAL_TYPES.ERROR, {
        event: 'failover-redirect-error',
        error: String(err?.message ?? err),
      })
    }
  }

  #isFailoverEligible() {
    return (
      this.#mode === REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN &&
      this.#currentRoute === CURRENT_ROUTES.PRIMARY
    )
  }

  #armFailoverTimer() {
    if (!this.#isFailoverEligible()) return
    if (navigator.onLine === false) return
    if (this.#failoverTimer !== null) return

    const timeoutSeconds = this.#readFailoverTimeoutSeconds()
    this.#failoverTimer = setTimeout(() => this.#onTimerExpired(), timeoutSeconds * 1000)
  }

  #cancelFailoverTimer() {
    if (this.#failoverTimer !== null) {
      clearTimeout(this.#failoverTimer)
      this.#failoverTimer = null
    }
  }

  /**
   * Timeout defensivo: mínimo 10s, máximo 120s, fallback 30s. Nunca confia
   * cegamente no valor gravado (pode estar corrompido ou editado à mão).
   */
  #readFailoverTimeoutSeconds() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.FAILOVER_TIMEOUT)
    if (raw === null || raw === undefined || raw === '') {
      return DEFAULTS.FAILOVER_TIMEOUT_SECONDS
    }
    const value = Number(raw)
    if (!Number.isFinite(value)) return DEFAULTS.FAILOVER_TIMEOUT_SECONDS
    return Math.min(Math.max(value, MIN_FAILOVER_TIMEOUT_SECONDS), MAX_FAILOVER_TIMEOUT_SECONDS)
  }

  #setState(next) {
    if (this.#state === next) return
    this.#state = next
  }
}
