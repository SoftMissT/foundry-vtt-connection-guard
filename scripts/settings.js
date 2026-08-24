import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'
import { GmPanel } from './gm-panel.js'
import { WebRtcAdvisor } from './webrtc-advisor.js'

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

// registerMenu exige uma classe FormApplication/ApplicationV2 com um
// construtor sem argumentos obrigatórios e um método render(). Usamos
// classes "launcher" enxutas que só abrem os apps reais, para não
// acoplar GmPanel/WebRtcAdvisor ao contrato de FormApplication.
class GmPanelMenuLauncher extends FormApplication {
  render() {
    new GmPanel().render(true)
    return this
  }
  async _updateObject() {}
  get template() {
    return null
  }
}

class WebRtcAdvisorMenuLauncher extends FormApplication {
  render() {
    new WebRtcAdvisor().render(true)
    return this
  }
  async _updateObject() {}
  get template() {
    return null
  }
}
