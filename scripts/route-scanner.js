import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'
import { scoreRouteResult } from './route-score.js'

/**
 * Scanner de rotas do Abyss Link.
 *
 * Usa fetch(mode: "no-cors") para testar alcançabilidade cross-origin sem
 * exigir CORS no servidor Foundry. Isso mede "tempo até o navegador conseguir
 * falar com o endpoint", não substitui um ping ICMP nem altera rotas reais.
 */
export class RouteScanner {
  constructor(journal = null) {
    this.journal = journal
  }

  async scanAll(profiles) {
    const startedAt = performance.now()
    const results = await Promise.all((profiles ?? []).map(profile => this.scanOne(profile)))
    const finishedAt = performance.now()

    return {
      userId: game.user?.id,
      userName: game.user?.name,
      timestamp: Date.now(),
      currentOrigin: window.location?.origin ?? '',
      durationMs: Math.round(finishedAt - startedAt),
      results: results.sort((a, b) => a.score - b.score || a.priority - b.priority),
    }
  }

  async scanOne(profile) {
    const attempts = DEFAULTS.ROUTE_SCAN_ATTEMPTS
    const samples = []

    for (let i = 0; i < attempts; i++) {
      samples.push(await this.#probe(profile))
    }

    const success = samples.filter(s => s.ok)
    const lossPct = Math.round(((attempts - success.length) / attempts) * 100)

    if (!success.length) {
      const failed = {
        ...profile,
        reachable: false,
        samples: [],
        medianMs: null,
        jitterMs: null,
        lossPct,
        hintKey: this.#hintKeyForFailure(samples),
      }
      return { ...failed, ...scoreRouteResult(failed) }
    }

    const times = success.map(s => s.timeMs).sort((a, b) => a - b)
    const minMs = times[0]
    const maxMs = times[times.length - 1]
    const medianMs = times[Math.floor(times.length / 2)]
    const averageMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const jitterMs = Math.round(maxMs - minMs)

    const result = {
      ...profile,
      reachable: true,
      samples: times,
      minMs,
      maxMs,
      medianMs,
      averageMs,
      jitterMs,
      lossPct,
      hintKey: null,
    }

    return { ...result, ...scoreRouteResult(result) }
  }

  async #probe(profile) {
    const timeoutMs = Number(game.settings.get(MODULE_ID, SETTINGS.ROUTE_SCAN_TIMEOUT))
    const finalTimeout = Number.isFinite(timeoutMs) ? timeoutMs : DEFAULTS.ROUTE_SCAN_TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), finalTimeout)
    const url = this.#cacheBust(profile.url)

    const startedAt = performance.now()
    try {
      await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      })
      return { ok: true, timeMs: Math.round(performance.now() - startedAt) }
    } catch (err) {
      return {
        ok: false,
        timeMs: null,
        reason: err?.name === 'AbortError' ? 'timeout' : String(err?.message ?? err),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  #cacheBust(url) {
    const parsed = new URL(url)
    parsed.searchParams.set(
      'connectionGuardProbe',
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    )
    return parsed.toString()
  }

  #hintKeyForFailure(samples) {
    const reasons = samples.map(s => s.reason || '').join(' ')
    if (/mixed|https/i.test(reasons)) return 'CONNGUARD.Route.Hint.MixedContent'
    if (/timeout|abort/i.test(reasons)) return 'CONNGUARD.Route.Hint.Timeout'
    return 'CONNGUARD.Route.Hint.Unreachable'
  }
}
