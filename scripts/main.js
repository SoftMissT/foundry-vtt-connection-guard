import { MODULE_ID, SOCKET_EVENT, JOURNAL_TYPES, DEFAULTS } from './constants.js'
import { registerSettings, setMenuDependencies } from './settings.js'
import { LatencyMonitor } from './latency-monitor.js'
import { DiagnosticsStore } from './diagnostics.js'
import { ReconnectManager } from './reconnect-manager.js'
import { PlayerListUI } from './player-list-ui.js'
import { JournalLogger } from './journal-logger.js'

const journal = new JournalLogger()
let lastExportCount = 0
let lastExportTime = Date.now()
let exportInProgress = false

async function autoExportJournal() {
  if (exportInProgress || journal.entryCount === 0) return
  const countSince = journal.entryCount - lastExportCount
  const timeSince = Date.now() - lastExportTime
  if (countSince < DEFAULTS.JOURNAL_AUTO_EXPORT_ENTRIES && timeSince < DEFAULTS.JOURNAL_AUTO_EXPORT_INTERVAL_MS) return

  exportInProgress = true
  try {
    await journal.exportToJournalEntry()
    lastExportCount = journal.entryCount
    lastExportTime = Date.now()
  } catch (err) {
    console.error(`${MODULE_ID} | auto-export journal falhou`, err)
  } finally {
    exportInProgress = false
  }
}

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
    autoExportJournal()
  }, 10000)

  monitor.start()

  Hooks.once('shutdown', async () => {
    console.log(`${MODULE_ID} | shutdown — limpando recursos`)
    monitor.stop()
    reconnectManager.stop()
    playerListUI.destroy()
    clearInterval(sweepIntervalId)
    game.socket?.off(SOCKET_EVENT, onSocketSample)
    if (journal.entryCount > 0) {
      try {
        await journal.exportToJournalEntry()
      } catch (err) {
        console.error(`${MODULE_ID} | export journal no shutdown falhou`, err)
      }
    }
    journal.clear()
  })
})
