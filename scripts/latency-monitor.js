import { MODULE_ID, SOCKET_EVENT, SETTINGS, DEFAULTS } from './constants.js'

/**
 * Mede o round-trip-time do cliente local contra o servidor Foundry usando
 * game.time.sync() (mesma técnica do foundry-user-latency original), com
 * timeout para detectar ciclos "perdidos" (usado na estimativa de perda).
 * Transmite os resultados via socket para todos os outros clientes.
 *
 * Evolução v2.0.0:
 * - Adaptive interval: mede mais frequente quando a conexão está ruim,
 *   menos quando está estável (RF-004).
 * - Detecção preditiva: conta ciclos consecutivos acima do limiar de
 *   degradação e emite alerta via callback onDegradation (RF-003.2).
 */
export class LatencyMonitor {
  static HISTORY_SIZE = DEFAULTS.HISTORY_SIZE
  static LOSS_WINDOW_SIZE = 20

  #history = []
  #recentCycles = [] // true = sucesso, false = perdido (sliding window)
  #running = false
  #intervalMs = DEFAULTS.LATENCY_INTERVAL_SECONDS * 1000
  #consecutiveBadCycles = 0
  #onSample
  #onDegradation
  #cachedDegThreshold = DEFAULTS.DEGRADATION_THRESHOLD_MS
  #cachedDegCycles = DEFAULTS.DEGRADATION_CYCLES

  /**
   * @param {(sample: object) => void} onSample chamado a cada ciclo local
   * @param {(alert: object) => void} [onDegradation] chamado quando degradação é detectada
   */
  constructor(onSample, onDegradation = null) {
    this.#onSample = onSample
    this.#onDegradation = onDegradation
  }

  start() {
    if (this.#running) return
    this.#running = true
    this.#readAllSettings()
    Hooks.on('updateSetting', doc => {
      if (doc.key === `${MODULE_ID}.${SETTINGS.LATENCY_INTERVAL}`) this.#readIntervalSetting()
      if (doc.key === `${MODULE_ID}.${SETTINGS.DEGRADATION_THRESHOLD}`) {
        const v = Number(doc.value)
        this.#cachedDegThreshold = Number.isFinite(v) ? v : DEFAULTS.DEGRADATION_THRESHOLD_MS
      }
      if (doc.key === `${MODULE_ID}.${SETTINGS.DEGRADATION_CYCLES}`) {
        const v = Number(doc.value)
        this.#cachedDegCycles = Number.isFinite(v) ? v : DEFAULTS.DEGRADATION_CYCLES
      }
    })
    this.#loop()
  }

  /** Último intervalo de medição aplicado, em ms (para uso externo, ex.: sweepStale). */
  get intervalMs() {
    return this.#intervalMs
  }

  stop() {
    this.#running = false
  }

  async #loop() {
    while (this.#running) {
      await this.#sleep(this.#intervalMs)
      if (!this.#running) break
      await this.#measureOnce()
    }
  }

  #readAllSettings() {
    this.#readIntervalSetting()
    const degThreshold = Number(game.settings.get(MODULE_ID, SETTINGS.DEGRADATION_THRESHOLD))
    this.#cachedDegThreshold = Number.isFinite(degThreshold)
      ? degThreshold
      : DEFAULTS.DEGRADATION_THRESHOLD_MS
    const degCycles = Number(game.settings.get(MODULE_ID, SETTINGS.DEGRADATION_CYCLES))
    this.#cachedDegCycles = Number.isFinite(degCycles) ? degCycles : DEFAULTS.DEGRADATION_CYCLES
  }

  #readIntervalSetting() {
    const configured = Number(game.settings.get(MODULE_ID, SETTINGS.LATENCY_INTERVAL))
    const seconds = Number.isFinite(configured) ? configured : DEFAULTS.LATENCY_INTERVAL_SECONDS
    this.#intervalMs = Math.max(seconds, DEFAULTS.MIN_INTERVAL_SECONDS) * 1000
  }

  /**
   * Ajusta o intervalo conforme a qualidade da conexão (RF-004).
   * Bom → multiplica por 1.5 (mede menos).
   * Ruim → multiplica por 0.5 (mede mais).
   * Respeita min/max configurados.
   */
  #adaptInterval(average) {
    if (average === null) return

    if (average <= DEFAULTS.ADAPTIVE_GOOD_THRESHOLD_MS) {
      this.#intervalMs = Math.min(
        this.#intervalMs * DEFAULTS.ADAPTIVE_GOOD_MULTIPLIER,
        DEFAULTS.ADAPTIVE_MAX_INTERVAL_MS,
      )
    } else if (average >= DEFAULTS.ADAPTIVE_BAD_THRESHOLD_MS) {
      this.#intervalMs = Math.max(
        this.#intervalMs * DEFAULTS.ADAPTIVE_BAD_MULTIPLIER,
        DEFAULTS.ADAPTIVE_MIN_INTERVAL_MS,
      )
    }
  }

  /**
   * Verifica degradação preditiva (RF-003.2).
   * Se RTT médio > limiar por N ciclos consecutivos, emite alerta.
   */
  #checkDegradation(average) {
    if (average === null) {
      this.#consecutiveBadCycles = 0
      return
    }

    if (average > this.#cachedDegThreshold) {
      this.#consecutiveBadCycles++
    } else {
      this.#consecutiveBadCycles = 0
    }

    if (this.#consecutiveBadCycles >= this.#cachedDegCycles) {
      this.#onDegradation?.({
        userId: game.user?.id,
        userName: game.user?.name,
        rtt: average,
        cycles: this.#consecutiveBadCycles,
      })
      this.#consecutiveBadCycles = 0
    }
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async #measureOnce() {
    if (!game.socket?.connected || !game.user?.id) return

    const timeoutMs = Math.min(this.#intervalMs * 0.8, 8000)
    const start = performance.now()

    let success = false
    try {
      await this.#withTimeout(game.time.sync(), timeoutMs)
      const rtt = Math.round(performance.now() - start)
      this.#recordSample(rtt)
      success = true
    } catch (err) {
      console.warn(`${MODULE_ID} | ciclo de latência perdido (${err?.message ?? err})`)
    }

    this.#recentCycles.push(success)
    if (this.#recentCycles.length > LatencyMonitor.LOSS_WINDOW_SIZE) {
      this.#recentCycles.shift()
    }

    const stats = this.#stats()
    this.#adaptInterval(stats.average)
    this.#checkDegradation(stats.average)
    this.#broadcast(stats)
  }

  #withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms)
      promise.then(
        v => {
          clearTimeout(timer)
          resolve(v)
        },
        err => {
          clearTimeout(timer)
          reject(err)
        },
      )
    })
  }

  #recordSample(rtt) {
    this.#history.push(rtt)
    if (this.#history.length > LatencyMonitor.HISTORY_SIZE) this.#history.shift()
  }

  #stats() {
    const n = this.#history.length
    if (n === 0) return { average: null, jitter: null, min: null, max: null, lossPct: 0 }

    const average = Math.round(this.#history.reduce((a, b) => a + b, 0) / n)
    const variance = this.#history.reduce((acc, v) => acc + (v - average) ** 2, 0) / n
    const jitter = Math.round(Math.sqrt(variance))
    let min = this.#history[0]
    let max = this.#history[0]
    for (let i = 1; i < n; i++) {
      if (this.#history[i] < min) min = this.#history[i]
      if (this.#history[i] > max) max = this.#history[i]
    }
    const windowSize = this.#recentCycles.length || 1
    const missedInWindow = this.#recentCycles.filter(c => !c).length
    const lossPct = Math.round((missedInWindow / windowSize) * 100)

    return { average, jitter, min, max, lossPct }
  }

  #broadcast(stats) {
    const payload = {
      userId: game.user?.id,
      timestamp: Date.now(),
      ...stats,
    }
    game.socket?.emit(SOCKET_EVENT, payload)
    this.#onSample?.(payload)
  }
}
