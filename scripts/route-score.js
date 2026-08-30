/**
 * Motor de score do Route Oracle.
 *
 * Quanto menor o score, melhor. O score é deliberadamente simples e
 * explicável para mesa de RPG: RTT baixo ganha, jitter/perda/quedas punem.
 */

export function scoreRouteResult(result) {
  if (!result?.reachable) {
    return {
      score: Infinity,
      band: 'sealed',
      statusKey: 'CONNGUARD.Route.Status.Sealed',
      cssClass: 'connguard-route-sealed',
    }
  }

  const median = Number(result.medianMs ?? result.averageMs ?? 999)
  const jitter = Number(result.jitterMs ?? 0)
  const loss = Number(result.lossPct ?? 0)
  const reconnectPenalty = Number(result.reconnectPenalty ?? 0)
  const vpnPenalty = result.requiresVpn ? 10 : 0
  const manualRiskPenalty = result.type === 'custom' ? 8 : 0

  const score = Math.round(
    median + jitter * 1.5 + loss * 20 + reconnectPenalty + vpnPenalty + manualRiskPenalty,
  )

  if (score <= 100) {
    return {
      score,
      band: 'stable',
      statusKey: 'CONNGUARD.Route.Status.Stable',
      cssClass: 'connguard-route-stable',
    }
  }

  if (score <= 220) {
    return {
      score,
      band: 'drift',
      statusKey: 'CONNGUARD.Route.Status.Drift',
      cssClass: 'connguard-route-drift',
    }
  }

  if (score <= 400) {
    return {
      score,
      band: 'fractured',
      statusKey: 'CONNGUARD.Route.Status.Fractured',
      cssClass: 'connguard-route-fractured',
    }
  }

  return {
    score,
    band: 'critical',
    statusKey: 'CONNGUARD.Route.Status.Critical',
    cssClass: 'connguard-route-critical',
  }
}

export function pickBestRoute(results) {
  const reachable = (results ?? []).filter(r => r?.reachable)
  if (!reachable.length) return null
  return reachable
    .map(r => ({ ...r, ...scoreRouteResult(r) }))
    .sort((a, b) => a.score - b.score || (a.priority ?? 10) - (b.priority ?? 10))[0]
}
