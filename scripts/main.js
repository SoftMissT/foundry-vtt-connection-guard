import { MODULE_ID, SOCKET_EVENT, JOURNAL_TYPES } from './constants.js'
import { registerSettings } from './settings.js'
import { LatencyMonitor } from './latency-monitor.js'
import { DiagnosticsStore } from './diagnostics.js'
import { ReconnectManager } from './reconnect-manager.js'
import { PlayerListUI } from './player-list-ui.js'
import { GmPanel } from './gm-panel.js'
import { WebRtcOptimizer } from './webrtc-optimizer.js'
import { JournalLogger } from './journal-logger.js'

const journal = new JournalLogger()

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | inicializando`)
  journal.log(JOURNAL_TYPES.LIFECYCLE, { message: 'Módulo inicializado' })
  registerSettings()
})

Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | pronto`)
  journal.log(JOURNAL_TYPES.LIFECYCLE, { message: 'Módulo pronto' })

  const diagnostics = new DiagnosticsStore()
  const playerListUI = new PlayerListUI(diagnostics)
  const reconnectManager = new ReconnectManager(diagnostics, journal)

  GmPanel.diagnostics = diagnostics
  GmPanel.journal = journal
  WebRtcOptimizer.journal = journal

  playerListUI.registerHooks()
  reconnectManager.start()

  const monitor = new LatencyMonitor(
    payload => {
      diagnostics.recordSample(payload)
      playerListUI.refresh(payload.userId)
      const userName = game.users.get(payload.userId)?.name ?? payload.userId
      journal.log(JOURNAL_TYPES.LATENCY, { ...payload, userName })
    },
    alert => {
      diagnostics.recordDegradation(alert.userId, alert.rtt, alert.cycles)
      ui.notifications.warn(
        game.i18n.format('CONNGUARD.Notif.Degradation', {
          rtt: alert.rtt,
          cycles: alert.cycles,
        }),
      )
      journal.log(JOURNAL_TYPES.DEGRADATION, alert)
    },
  )

  game.socket?.on(SOCKET_EVENT, payload => {
    diagnostics.recordSample(payload)
    playerListUI.refresh(payload.userId)
    const userName = game.users.get(payload.userId)?.name ?? payload.userId
    journal.log(JOURNAL_TYPES.LATENCY, { ...payload, userName })
  })

  // Varre usuários "sem resposta" periodicamente, independente do ciclo
  // de medição de cada um (que roda no client de cada jogador).
  setInterval(() => {
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
})
