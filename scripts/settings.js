import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'
import { GmPanel } from './gm-panel.js'
import { WebRtcOptimizer } from './webrtc-optimizer.js'

/** Referências para as instâncias reais, preenchidas por main.js no ready. */
let _diagnostics = null
let _journal = null

/**
 * Registra as dependências que os menu launchers precisam.
 * Chamado por main.js no hook 'ready', antes de abrir qualquer painel.
 */
export function setMenuDependencies(diagnostics, journal) {
  _diagnostics = diagnostics
  _journal = journal
}

export function registerSettings() {
  const g = game

  g.settings.register(MODULE_ID, SETTINGS.LATENCY_INTERVAL, {
    name: g.i18n.localize('CONNGUARD.Settings.Interval.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.Interval.Hint'),
    type: Number,
    range: { min: DEFAULTS.MIN_INTERVAL_SECONDS, max: 90, step: 5 },
    default: DEFAULTS.LATENCY_INTERVAL_SECONDS,
    scope: 'world',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.HIDE_LATENCY, {
    name: g.i18n.localize('CONNGUARD.Settings.Hide.Name'),
    type: Boolean,
    default: false,
    scope: 'client',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.MICRO_LATENCY, {
    name: g.i18n.localize('CONNGUARD.Settings.Micro.Name'),
    type: Boolean,
    default: false,
    scope: 'client',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.SHOW_DIAGNOSTICS_TOOLTIP, {
    name: g.i18n.localize('CONNGUARD.Settings.DiagTooltip.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.DiagTooltip.Hint'),
    type: Boolean,
    default: true,
    scope: 'client',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.AUTO_RECONNECT, {
    name: g.i18n.localize('CONNGUARD.Settings.AutoReconnect.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.AutoReconnect.Hint'),
    type: Boolean,
    default: true,
    scope: 'client',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.RECONNECT_MAX_DELAY, {
    name: g.i18n.localize('CONNGUARD.Settings.ReconnectMaxDelay.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.ReconnectMaxDelay.Hint'),
    type: Number,
    range: { min: 3, max: 60, step: 1 },
    default: DEFAULTS.RECONNECT_MAX_DELAY_SECONDS,
    scope: 'client',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.DIAGNOSTICS_HISTORY_SIZE, {
    name: g.i18n.localize('CONNGUARD.Settings.HistorySize.Name'),
    type: Number,
    range: { min: 10, max: 100, step: 5 },
    default: DEFAULTS.DIAGNOSTICS_HISTORY_SIZE,
    scope: 'world',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.DEGRADATION_THRESHOLD, {
    name: g.i18n.localize('CONNGUARD.Settings.DegradationThreshold.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.DegradationThreshold.Hint'),
    type: Number,
    range: { min: 100, max: 1000, step: 50 },
    default: DEFAULTS.DEGRADATION_THRESHOLD_MS,
    scope: 'world',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.DEGRADATION_CYCLES, {
    name: g.i18n.localize('CONNGUARD.Settings.DegradationCycles.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.DegradationCycles.Hint'),
    type: Number,
    range: { min: 2, max: 10, step: 1 },
    default: DEFAULTS.DEGRADATION_CYCLES,
    scope: 'world',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.CUSTOM_STUN_SERVERS, {
    name: g.i18n.localize('CONNGUARD.Settings.CustomStun.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.CustomStun.Hint'),
    type: String,
    default: '',
    scope: 'world',
    config: true,
  })

  g.settings.register(MODULE_ID, SETTINGS.TURN_CREDENTIALS, {
    name: g.i18n.localize('CONNGUARD.Settings.TurnCredentials.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.TurnCredentials.Hint'),
    type: String,
    default: '',
    scope: 'world',
    restricted: true,
    config: true,
  })

  g.settings.registerMenu(MODULE_ID, SETTINGS.GM_PANEL_MENU, {
    name: g.i18n.localize('CONNGUARD.Menu.GmPanel.Name'),
    label: g.i18n.localize('CONNGUARD.Menu.GmPanel.Label'),
    hint: g.i18n.localize('CONNGUARD.Menu.GmPanel.Hint'),
    icon: 'fa-solid fa-signal',
    type: GmPanelMenuLauncher,
    restricted: true,
  })

  g.settings.registerMenu(MODULE_ID, SETTINGS.WEBRTC_ADVISOR_MENU, {
    name: g.i18n.localize('CONNGUARD.Menu.WebRtc.Name'),
    label: g.i18n.localize('CONNGUARD.Menu.WebRtc.Label'),
    hint: g.i18n.localize('CONNGUARD.Menu.WebRtc.Hint'),
    icon: 'fa-solid fa-tower-broadcast',
    type: WebRtcAdvisorMenuLauncher,
    restricted: true,
  })
}

// registerMenu exige uma classe com construtor sem argumentos obrigatórios
// e um método render(). Usamos referências lazy às dependências que só
// existem no hook 'ready'.
class GmPanelMenuLauncher {
  render() {
    if (!_diagnostics || !_journal) return
    new GmPanel(_diagnostics, _journal).render(true)
  }
}

class WebRtcAdvisorMenuLauncher {
  render() {
    if (!_journal) return
    new WebRtcOptimizer(_journal).render(true)
  }
}
