import { MODULE_ID, SETTINGS, DEFAULTS, SERVICE_CATALOG } from './constants.js'
import { isMixedContentRoute } from './route-profiles.js'
import { scoreRouteResult } from './route-score.js'

/**
 * Scanner de rotas do Abyss Link.
 *
 * Usa fetch(mode: "no-cors") para testar alcançabilidade cross-origin sem
 * exigir CORS no servidor Foundry. Isso mede "tempo até o navegador conseguir
 * falar com o endpoint", não substitui um ping ICMP nem altera rotas reais.
 *
 * v3.1.0:
 * - Tentativas de uma mesma rota rodam em PARALELO (Promise.allSettled):
 *   pior caso por rota = 1× timeout, não mais tentativas × timeout.
 *   Rotas mortas (ex.: Radmin VPN caído) não travam mais a UI por 3× timeout.
 * - scanAll aceita onProgress: cada rota resolvida é entregue na hora,
 *   permitindo render progressivo no wizard em vez de tela congelada.
 * - Hint de falha específico por serviço (Radmin/playit/ngrok/cloudflare).
 */
export class RouteScanner {
  constructor(journal = null) {
    this.journal = journal
  }

  async scanAll(profiles, onProgress = null) {
    const startedAt = performance.now()
    const scans = (profiles ?? []).map(async profile => {
      const result = await this.scanOne(profile)
      try {
        onProgress?.(result)
      } catch {
        // Uma falha de renderização não pode cancelar as outras sondagens.
      }
      return result
    })
    const results = await Promise.all(scans)
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
    const samples = await Promise.allSettled(
      Array.from({ length: attempts }, () => this.#probe(profile)),
    ).then(settled => settled.map(entry => entry.value).filter(Boolean))

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
        hintKey: this.#hintKeyForFailure(samples, profile),
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
    const url = this.#cacheBust(profile.url)

    if (isMixedContentRoute(url)) {
      return { ok: false, timeMs: null, reason: 'mixed-content' }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), finalTimeout)
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

  #hintKeyForFailure(samples, profile) {
    const reasons = samples.map(s => s.reason || '').join(' ')
    if (/mixed|https/i.test(reasons)) return 'CONNGUARD.Route.Hint.MixedContent'

    const serviceHint = SERVICE_CATALOG[profile?.type]?.hintKey
    if (serviceHint) return serviceHint

    if (/timeout|abort/i.test(reasons)) return 'CONNGUARD.Route.Hint.Timeout'
    return 'CONNGUARD.Route.Hint.Unreachable'
  }
}
