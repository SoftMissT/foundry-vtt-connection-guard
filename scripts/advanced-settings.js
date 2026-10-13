import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'

/**
 * Settings técnicos do módulo, fora da tela nativa de configurações.
 * O GM leigo vê só o essencial; o resto vive aqui, em linguagem simples.
 * Escopo: 'world' = vale para a mesa (só GM grava); 'client' = só para quem grava.
 */
export const ADVANCED_SETTINGS = [
  {
    key: SETTINGS.LATENCY_INTERVAL,
    scope: 'world',
    min: DEFAULTS.MIN_INTERVAL_SECONDS,
    max: 90,
    step: 5,
    default: DEFAULTS.LATENCY_INTERVAL_SECONDS,
    labelKey: 'CONNGUARD.Settings.Interval.Name',
    hintKey: 'CONNGUARD.Settings.Interval.Hint',
  },
  {
    key: SETTINGS.DEGRADATION_THRESHOLD,
    scope: 'world',
    min: 100,
    max: 1000,
    step: 50,
    default: DEFAULTS.DEGRADATION_THRESHOLD_MS,
    labelKey: 'CONNGUARD.Settings.DegradationThreshold.Name',
    hintKey: 'CONNGUARD.Settings.DegradationThreshold.Hint',
  },
  {
    key: SETTINGS.DEGRADATION_CYCLES,
    scope: 'world',
    min: 2,
    max: 10,
    step: 1,
    default: DEFAULTS.DEGRADATION_CYCLES,
    labelKey: 'CONNGUARD.Settings.DegradationCycles.Name',
    hintKey: 'CONNGUARD.Settings.DegradationCycles.Hint',
  },
  {
    key: SETTINGS.DIAGNOSTICS_HISTORY_SIZE,
    scope: 'world',
    min: 10,
    max: 100,
    step: 5,
    default: DEFAULTS.DIAGNOSTICS_HISTORY_SIZE,
    labelKey: 'CONNGUARD.Settings.HistorySize.Name',
    hintKey: 'CONNGUARD.Settings.HistorySize.Hint',
  },
  {
    key: SETTINGS.ROUTE_SCAN_TIMEOUT,
    scope: 'world',
    min: 800,
    max: 10000,
    step: 100,
    default: DEFAULTS.ROUTE_SCAN_TIMEOUT_MS,
    labelKey: 'CONNGUARD.Settings.RouteScanTimeout.Name',
    hintKey: 'CONNGUARD.Settings.RouteScanTimeout.Hint',
  },
  {
    key: SETTINGS.FAILOVER_TIMEOUT,
    scope: 'world',
    min: 10,
    max: 120,
    step: 5,
    default: DEFAULTS.FAILOVER_TIMEOUT_SECONDS,
    labelKey: 'CONNGUARD.Settings.FailoverTimeout.Name',
    hintKey: 'CONNGUARD.Settings.FailoverTimeout.Hint',
  },
  {
    key: SETTINGS.RECONNECT_MAX_DELAY,
    scope: 'client',
    min: 3,
    max: 60,
    step: 1,
    default: DEFAULTS.RECONNECT_MAX_DELAY_SECONDS,
    labelKey: 'CONNGUARD.Settings.ReconnectMaxDelay.Name',
    hintKey: 'CONNGUARD.Settings.ReconnectMaxDelay.Hint',
  },
]

/**
 * Alinha ao passo e clampa nos limites; valor vazio ou inválido cai no padrão.
 * Nunca lança — entrada de formulário é dado, não confiança.
 */
export function sanitizeAdvancedValue(def, raw) {
  if (raw === null || raw === undefined) return def.default
  if (typeof raw === 'string' && raw.trim() === '') return def.default
  const num = Number(raw)
  if (!Number.isFinite(num)) return def.default
  const aligned = Math.round(num / def.step) * def.step
  return Math.min(def.max, Math.max(def.min, aligned))
}

/** HTML do formulário do painel Avançado. `t` é o localizador de i18n. */
export function buildAdvancedFormHtml(values, t) {
  const group = def => `
      <div class="form-group">
        <label for="connection-guard-adv-${def.key}">${t(def.labelKey)}</label>
        <div class="form-fields">
          <input
            id="connection-guard-adv-${def.key}"
            name="${def.key}"
            type="number"
            min="${def.min}"
            max="${def.max}"
            step="${def.step}"
            value="${Number(values[def.key] ?? def.default)}"
          />
        </div>
        <p class="notes">${t(def.hintKey)}</p>
      </div>`

  const world = ADVANCED_SETTINGS.filter(def => def.scope === 'world').map(group).join('')
  const client = ADVANCED_SETTINGS.filter(def => def.scope === 'client').map(group).join('')

  return `
    <p class="notes">${t('CONNGUARD.Advanced.Intro')}</p>
    <h3>${t('CONNGUARD.Advanced.SectionWorld')}</h3>
    ${world}
    <h3>${t('CONNGUARD.Advanced.SectionClient')}</h3>
    ${client}
  `
}

/** GM-only. Abre o formulário, sanitiza e grava apenas o que mudou. */
export async function openAdvancedSettings() {
  if (game.user?.isGM !== true) {
    ui.notifications?.warn(game.i18n.localize('CONNGUARD.Advanced.GmOnly'))
    return null
  }

  const values = {}
  for (const def of ADVANCED_SETTINGS) {
    values[def.key] = game.settings.get(MODULE_ID, def.key)
  }

  const result = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize('CONNGUARD.Advanced.Title') },
    content: buildAdvancedFormHtml(values, key => game.i18n.localize(key)),
    ok: game.i18n.localize('CONNGUARD.Advanced.Save'),
  })
  if (!result) return null

  const changed = []
  try {
    for (const def of ADVANCED_SETTINGS) {
      if (!(def.key in result)) continue
      const next = sanitizeAdvancedValue(def, result[def.key])
      if (next === game.settings.get(MODULE_ID, def.key)) continue
      await game.settings.set(MODULE_ID, def.key, next)
      changed.push(def.key)
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | falha ao salvar configurações avançadas`, err)
    ui.notifications?.error?.(game.i18n.localize('CONNGUARD.Advanced.SaveFailed'))
    return null
  }

  ui.notifications?.info(
    game.i18n.format('CONNGUARD.Advanced.Saved', { count: changed.length }),
  )
  return changed
}
