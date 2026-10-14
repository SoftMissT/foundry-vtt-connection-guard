import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'
import { normalizeRouteProfile, normalizeUrl } from './route-profiles.js'
import { scoreRouteResult } from './route-score.js'

const MAX_LATENCY_MS = 600000
const MAX_ROUTE_RESULTS = 32

function boundedNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null
}

function safeText(value, maxLength) {
  return String(value ?? '')
    .replace(/[<>&|`\r\n]/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function validUserId(userId, knownUsers) {
  return (
    typeof userId === 'string' &&
    userId.length > 0 &&
    userId.length <= 128 &&
    (!knownUsers?.has || knownUsers.has(userId))
  )
}

export function normalizeLatencySample(payload, knownUsers = null, receivedAt = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (!validUserId(payload.userId, knownUsers)) return null
  const average = boundedNumber(payload.average, 0, MAX_LATENCY_MS)
  const jitter = boundedNumber(payload.jitter, 0, MAX_LATENCY_MS)
  const lossPct = boundedNumber(payload.lossPct, 0, 100)
  if (average === null || jitter === null || lossPct === null) return null
  return { userId: payload.userId, average, jitter, lossPct, timestamp: receivedAt }
}

function normalizeRouteResult(result, index) {
  const profile = normalizeRouteProfile(result, index)
  if (profile) profile.label = safeText(profile.label, 64)
  if (!profile || result.reachable !== true) {
    return profile
      ? {
          ...profile,
          reachable: false,
          medianMs: null,
          averageMs: null,
          minMs: null,
          maxMs: null,
          jitterMs: null,
          lossPct: boundedNumber(result?.lossPct, 0, 100) ?? 100,
          ...scoreRouteResult({ ...profile, reachable: false }),
        }
      : null
  }
  const medianMs = boundedNumber(result.medianMs, 0, MAX_LATENCY_MS)
  const averageMs = boundedNumber(result.averageMs, 0, MAX_LATENCY_MS)
  const minMs = boundedNumber(result.minMs, 0, MAX_LATENCY_MS)
  const maxMs = boundedNumber(result.maxMs, 0, MAX_LATENCY_MS)
  const jitterMs = boundedNumber(result.jitterMs, 0, MAX_LATENCY_MS)
  const lossPct = boundedNumber(result.lossPct, 0, 100)
  if ([medianMs, averageMs, minMs, maxMs, jitterMs, lossPct].includes(null)) return null
  const normalized = {
    ...profile,
    reachable: true,
    medianMs,
    averageMs,
    minMs,
    maxMs,
    jitterMs,
    lossPct,
  }
  return { ...normalized, ...scoreRouteResult(normalized) }
}

export function normalizeRouteReport(report, knownUsers = null, receivedAt = Date.now()) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return null
  if (!validUserId(report.userId, knownUsers) || !Array.isArray(report.results)) return null
  const results = report.results
    .slice(0, MAX_ROUTE_RESULTS)
    .map(normalizeRouteResult)
    .filter(Boolean)
  if (!results.length) return null
  return {
    userId: report.userId,
    userName: safeText(knownUsers?.get?.(report.userId)?.name ?? report.userName, 128),
    timestamp: receivedAt,
    currentOrigin: normalizeUrl(report.currentOrigin) ?? '',
    durationMs: boundedNumber(report.durationMs, 0, MAX_LATENCY_MS) ?? 0,
    results,
  }
}

/**
 * Guarda em memória (dura enquanto a aba estiver aberta não persiste
 * entre sessões, de propósito, para não acumular dados sensíveis de rede
 * em um setting do mundo) o estado de conexão de cada usuário, o
 * histórico de quedas do cliente local, alertas de degradação preditiva,
 * e resultados do Abyss Link / Route Oracle.
 */
export class DiagnosticsStore {
  #users = new Map() // userId -> { average, jitter, lossPct, lastSeen, missedCycles, stale }
  #localDrops = [] // { start, end, durationMs }
  #dropStart = null
  #degradationAlerts = [] // { timestamp, userId, rtt, cycles }
  #routeReports = new Map() // userId -> route report

  recordSample(payload) {
    const prev = this.#users.get(payload.userId)
    this.#users.set(payload.userId, {
      average: payload.average,
      jitter: payload.jitter,
      lossPct: payload.lossPct,
      lastSeen: payload.timestamp,
      missedCycles: 0,
      stale: false,
    })
    return prev
  }

  /** Marca usuários como "sem resposta" se não mandam amostra há tempo demais. */
  sweepStale(intervalMs) {
    const now = Date.now()
    const limit = intervalMs * DEFAULTS.MISSED_PINGS_FOR_TIMEOUT
    for (const [, data] of this.#users.entries()) {
      data.stale = now - data.lastSeen > limit
    }
  }

  getUserData(userId) {
    return this.#users.get(userId) ?? null
  }

  getAllUsers() {
    return new Map(this.#users)
  }

  recordLocalDisconnect() {
    this.#dropStart = Date.now()
  }

  recordLocalReconnect() {
    if (!this.#dropStart) return
    const end = Date.now()
    const entry = { start: this.#dropStart, end, durationMs: end - this.#dropStart }
    this.#localDrops.push(entry)

    const max = Number(game.settings.get(MODULE_ID, SETTINGS.DIAGNOSTICS_HISTORY_SIZE))
    const limit = Number.isFinite(max) ? max : DEFAULTS.DIAGNOSTICS_HISTORY_SIZE
    if (this.#localDrops.length > limit) this.#localDrops.shift()

    this.#dropStart = null
    return entry
  }

  getLocalDrops() {
    return [...this.#localDrops]
  }

  isCurrentlyDown() {
    return this.#dropStart !== null
  }

  /** Registra um alerta de degradação preditiva (RF-003.2). */
  recordDegradation(userId, rtt, cycles) {
    this.#degradationAlerts.push({ timestamp: Date.now(), userId, rtt, cycles })

    const max = Number(game.settings.get(MODULE_ID, SETTINGS.DIAGNOSTICS_HISTORY_SIZE))
    const limit = Number.isFinite(max) ? max : DEFAULTS.DIAGNOSTICS_HISTORY_SIZE
    if (this.#degradationAlerts.length > limit) this.#degradationAlerts.shift()
  }

  getDegradationAlerts() {
    return [...this.#degradationAlerts]
  }

  /** Guarda o relatório mais recente de Route Oracle por usuário. */
  recordRouteReport(report) {
    if (!report?.userId) return null
    this.#routeReports.set(report.userId, {
      ...report,
      receivedAt: Date.now(),
    })
    return this.#routeReports.get(report.userId)
  }

  getRouteReport(userId) {
    return this.#routeReports.get(userId) ?? null
  }

  getAllRouteReports() {
    return new Map(this.#routeReports)
  }

  getBestRouteForUser(userId) {
    const report = this.getRouteReport(userId)
    const reachable = report?.results?.filter(r => r.reachable) ?? []
    if (!reachable.length) return null
    return reachable.slice().sort((a, b) => a.score - b.score || a.priority - b.priority)[0]
  }
}
