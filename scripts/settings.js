import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'
import { GmPanel } from './gm-panel.js'
import { RouteWizard } from './route-wizard.js'
import { openServiceWizard } from './service-wizard.js'

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

  g.settings.register(MODULE_ID, SETTINGS.ABYSS_THEME, {
    name: g.i18n.localize('CONNGUARD.Settings.AbyssTheme.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.AbyssTheme.Hint'),
    type: Boolean,
    default: true,
    scope: 'world',
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

  // Rota ativa da mesa: world e NÃO-restricted de propósito. A URL precisa
  // ser legível por todos os clientes (o jogador conecta por ela); somente
  // o GM pode gravar (world scope). Sem UI de settings: o GM define pelo
  // Painel ou pelo Route Oracle.
  g.settings.register(MODULE_ID, SETTINGS.ACTIVE_ROUTE, {
    type: String,
    default: '',
    scope: 'world',
    config: false,
  })

  g.settings.register(MODULE_ID, SETTINGS.ROUTE_PROFILES, {
    type: String,
    default: '',
    scope: 'world',
    config: false,
  })

  g.settings.register(MODULE_ID, SETTINGS.ROUTE_SCAN_TIMEOUT, {
    name: g.i18n.localize('CONNGUARD.Settings.RouteScanTimeout.Name'),
    hint: g.i18n.localize('CONNGUARD.Settings.RouteScanTimeout.Hint'),
    type: Number,
    range: { min: 800, max: 10000, step: 100 },
    default: DEFAULTS.ROUTE_SCAN_TIMEOUT_MS,
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

  g.settings.registerMenu(MODULE_ID, SETTINGS.ROUTE_ORACLE_MENU, {
    name: g.i18n.localize('CONNGUARD.Menu.RouteOracle.Name'),
    label: g.i18n.localize('CONNGUARD.Menu.RouteOracle.Label'),
    hint: g.i18n.localize('CONNGUARD.Menu.RouteOracle.Hint'),
    icon: 'fa-solid fa-route',
    type: RouteOracleMenuLauncher,
    restricted: false,
  })

  g.settings.registerMenu(MODULE_ID, SETTINGS.SERVICE_WIZARD_MENU, {
    name: g.i18n.localize('CONNGUARD.Menu.ServiceWizard.Name'),
    label: g.i18n.localize('CONNGUARD.Menu.ServiceWizard.Label'),
    hint: g.i18n.localize('CONNGUARD.Menu.ServiceWizard.Hint'),
    icon: 'fa-solid fa-network-wired',
    type: ServiceWizardMenuLauncher,
    restricted: true,
  })
}

// registerMenu exige uma classe com construtor sem argumentos obrigatórios
// e que seja subclass de ApplicationV2 ou FormApplication no Foundry moderno.
// Usamos referências lazy às dependências que só existem no hook 'ready'.
class GmPanelMenuLauncher extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'connection-guard-gm-panel-launcher' }

  render(_options) {
    if (!_diagnostics || !_journal) {
      ui.notifications?.warn(game.i18n.localize('CONNGUARD.Menu.DependenciesNotReady'))
      return this
    }

    new GmPanel(_diagnostics, _journal).render(true)
    return this
  }

  _renderHTML() {
    return ''
  }

  _updateHTML() {}
}

class RouteOracleMenuLauncher extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'connection-guard-route-oracle-launcher' }

  render(_options) {
    if (!_diagnostics || !_journal) {
      ui.notifications?.warn(game.i18n.localize('CONNGUARD.Menu.DependenciesNotReady'))
      return this
    }

    new RouteWizard(_diagnostics, _journal).render(true)
    return this
  }

  _renderHTML() {
    return ''
  }

  _updateHTML() {}
}

class ServiceWizardMenuLauncher extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'connection-guard-service-wizard-launcher' }

  render(_options) {
    openServiceWizard()
    return this
  }

  _renderHTML() {
    return ''
  }

  _updateHTML() {}
}
