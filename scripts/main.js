import { MODULE_ID, SOCKET_EVENT } from './constants.js'
import { registerSettings } from './settings.js'
import { LatencyMonitor } from './latency-monitor.js'
import { DiagnosticsStore } from './diagnostics.js'
import { ReconnectManager } from './reconnect-manager.js'
import { PlayerListUI } from './player-list-ui.js'
import { GmPanel } from './gm-panel.js'

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | inicializando`)
  registerSettings()
})

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | pronto`)

  const diagnostics = new DiagnosticsStore()
  const playerListUI = new PlayerListUI(diagnostics)
  const reconnectManager = new ReconnectManager(diagnostics)

  // Compartilha a instância de diagnósticos com o painel do GM sem exigir
  // um construtor com argumentos (registerMenu instancia com `new Tipo()`).
  GmPanel.diagnostics = diagnostics

  playerListUI.registerHooks()
  reconnectManager.start()

  const monitor = new LatencyMonitor(payload => {
    diagnostics.recordSample(payload)
    playerListUI.refresh(payload.userId)
  })

  game.socket?.on(SOCKET_EVENT, payload => {
    diagnostics.recordSample(payload)
    playerListUI.refresh(payload.userId)
  })

  // Varre usuários "sem resposta" periodicamente, independente do ciclo
  // de medição de cada um (que roda no client de cada jogador).
  setInterval(() => {
    diagnostics.sweepStale(monitor.intervalMs ?? 20000)
    for (const userId of diagnostics.getAllUsers().keys()) playerListUI.refresh(userId)
  }, 10000)

  monitor.start()
})
