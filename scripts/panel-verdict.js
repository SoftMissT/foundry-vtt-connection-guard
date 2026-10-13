/**
 * Veredito de estado do painel do GM — função pura, testável fora do Foundry.
 * Recebe as linhas de diagnóstico já montadas e devolve o nível do aviso.
 */
export const VERDICT_LEVELS = { OK: 'ok', ATTENTION: 'attention', PROBLEM: 'problem' }

const DEFAULT_THRESHOLD_MS = 300

/**
 * @param {Array<{hasData:boolean, stale:boolean, average:number|null}>} rows
 * @param {number} alertCount alertas de degradação registrados na sessão
 * @param {number} thresholdMs limiar de degradação (ms)
 */
export function resolveConnectionVerdict(rows, alertCount, thresholdMs) {
  const list = Array.isArray(rows) ? rows : []
  const threshold = Number.isFinite(Number(thresholdMs))
    ? Number(thresholdMs)
    : DEFAULT_THRESHOLD_MS
  const alerts = Number.isFinite(Number(alertCount)) ? Number(alertCount) : 0

  let stale = 0
  let high = 0
  let noData = 0

  for (const row of list) {
    if (!row) continue
    if (row.hasData !== true) {
      noData += 1
      continue
    }
    if (row.stale === true) {
      stale += 1
      continue
    }
    if (Number.isFinite(Number(row.average)) && Number(row.average) > threshold) {
      high += 1
    }
  }

  let level = VERDICT_LEVELS.OK
  if (stale > 0) level = VERDICT_LEVELS.PROBLEM
  else if (high > 0 || alerts > 0) level = VERDICT_LEVELS.ATTENTION

  return { level, counts: { total: list.length, stale, high, noData, alerts } }
}
