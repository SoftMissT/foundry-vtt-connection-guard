import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'

/**
 * Guarda em memória (dura enquanto a aba estiver aberta — não persiste
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
