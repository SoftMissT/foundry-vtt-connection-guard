import { MODULE_ID, SOCKET_EVENT, SETTINGS, DEFAULTS } from './constants.js'

/**
 * Mede o round-trip-time do cliente local contra o servidor Foundry usando
 * game.time.sync() (mesma técnica do foundry-user-latency original), com
 * timeout para detectar ciclos "perdidos" (usado na estimativa de perda).
 * Transmite os resultados via socket para todos os outros clientes.
 */
export class LatencyMonitor {
  static HISTORY_SIZE = DEFAULTS.HISTORY_SIZE

  #history = []
  #missed = 0
  #cycles = 0
  #running = false
  #intervalMs = DEFAULTS.LATENCY_INTERVAL_SECONDS * 1000
  #onSample

  /** @param {(sample: object) => void} onSample chamado a cada ciclo local */
  constructor(onSample) {
    this.#onSample = onSample
  }

  start() {
    if (this.#running) return
    this.#running = true
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
      this.#readIntervalSetting()
      await this.#sleep(this.#intervalMs)
      if (!this.#running) break
      await this.#measureOnce()
    }
  }

  #readIntervalSetting() {
    const configured = Number(game.settings.get(MODULE_ID, SETTINGS.LATENCY_INTERVAL))
    const seconds = Number.isFinite(configured) ? configured : DEFAULTS.LATENCY_INTERVAL_SECONDS
    this.#intervalMs = Math.max(seconds, DEFAULTS.MIN_INTERVAL_SECONDS) * 1000
  }

  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async #measureOnce() {
    if (!game.socket?.connected || !game.user?.id) return

    const timeoutMs = Math.min(this.#intervalMs * 0.8, 8000)
    const start = performance.now()

    try {
      await this.#withTimeout(game.time.sync(), timeoutMs)
      const rtt = Math.round(performance.now() - start)
      this.#recordSample(rtt)
    } catch (err) {
      this.#missed += 1
      console.warn(`${MODULE_ID} | ciclo de latência perdido (${err?.message ?? err})`)
    }

    this.#cycles += 1
    this.#broadcast()
  }

  #withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms)
      promise.then(v => {
        clearTimeout(timer)
        resolve(v)
      }, err => {
        clearTimeout(timer)
        reject(err)
      })
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
    const min = Math.min(...this.#history)
    const max = Math.max(...this.#history)
    const totalCycles = this.#cycles || 1
    const lossPct = Math.round((this.#missed / totalCycles) * 100)

    return { average, jitter, min, max, lossPct }
  }

  #broadcast() {
    const stats = this.#stats()
    const payload = {
      userId: game.user.id,
      timestamp: Date.now(),
      ...stats,
    }
    game.socket?.emit(SOCKET_EVENT, payload)
    this.#onSample?.(payload)
  }
}
