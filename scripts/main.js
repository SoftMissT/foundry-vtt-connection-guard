import { MODULE_ID, SOCKET_EVENT, JOURNAL_TYPES } from './constants.js'
import { registerSettings, setMenuDependencies } from './settings.js'
import { LatencyMonitor } from './latency-monitor.js'
import { DiagnosticsStore } from './diagnostics.js'
import { ReconnectManager } from './reconnect-manager.js'
import { PlayerListUI } from './player-list-ui.js'
import { JournalLogger } from './journal-logger.js'

const journal = new JournalLogger()

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | inicializando`)
  journal.log(JOURNAL_TYPES.LIFECYCLE, { message: 'Módulo inicializado' })
  registerSettings()
})

/**
 * Processa uma amostra de latência recebida (local ou por socket).
 * Ponto único de lógica para evitar duplicação.
 */
function handleSample(payload, diagnostics, playerListUI, journalRef) {
  diagnostics.recordSample(payload)
  playerListUI.refresh(payload.userId)
  const userName = game.users.get(payload.userId)?.name ?? payload.userId
  journalRef.log(JOURNAL_TYPES.LATENCY, { ...payload, userName })
}

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | pronto`)
  journal.log(JOURNAL_TYPES.LIFECYCLE, { message: 'Módulo pronto' })

  const diagnostics = new DiagnosticsStore()
  const playerListUI = new PlayerListUI(diagnostics)
  const reconnectManager = new ReconnectManager(diagnostics, journal)

  setMenuDependencies(diagnostics, journal)

  playerListUI.registerHooks()
  reconnectManager.start()

  const monitor = new LatencyMonitor(
    payload => handleSample(payload, diagnostics, playerListUI, journal),
    alert => {
      diagnostics.recordDegradation(alert.userId, alert.rtt, alert.cycles)
      ui.notifications?.warn(
        game.i18n.format('CONNGUARD.Notif.Degradation', {
          rtt: alert.rtt,
          cycles: alert.cycles,
        }),
      )
      journal.log(JOURNAL_TYPES.DEGRADATION, alert)
    },
  )

  const onSocketSample = payload => handleSample(payload, diagnostics, playerListUI, journal)
  game.socket?.on(SOCKET_EVENT, onSocketSample)

  const sweepIntervalId = setInterval(() => {
    diagnostics.sweepStale(monitor.intervalMs ?? 20000)
    for (const [userId, data] of diagnostics.getAllUsers().entries()) {
      playerListUI.refresh(userId)
      if (data.stale) {
        const userName = game.users.get(userId)?.name ?? userId
        journal.log(JOURNAL_TYPES.STALE, { userId, userName, lastSeen: data.lastSeen })
      }
    }
  }, 10000)

  monitor.start()

  Hooks.once('shutdown', () => {
    console.log(`${MODULE_ID} | shutdown — limpando recursos`)
    monitor.stop()
    reconnectManager.stop()
    playerListUI.destroy()
    clearInterval(sweepIntervalId)
    game.socket?.off(SOCKET_EVENT, onSocketSample)
    journal.clear()
  })
})
