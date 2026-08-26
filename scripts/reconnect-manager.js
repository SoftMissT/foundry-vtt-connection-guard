import { MODULE_ID, SETTINGS, DEFAULTS, JOURNAL_TYPES } from './constants.js'

/**
 * Ajusta os parâmetros de reconexão do Socket.IO (game.socket.io é a
 * instância Manager da biblioteca socket.io-client que o Foundry já usa
 * internamente) e força uma tentativa extra quando o navegador detecta
 * que voltou a ter rede ou quando a aba volta a ficar visível — cenários
 * comuns em que o Foundry sozinho demora para perceber que já pode
 * reconectar.
 *
 * Isso NÃO escolhe "rotas" de rede (o cliente sempre fala com o único
 * servidor Foundry configurado); o que dá para melhorar de verdade,
 * dentro de um módulo, é a velocidade e a persistência da reconexão.
 */
export class ReconnectManager {
  #diagnostics
  #journal
  #bannerEl = null
  #boundOnDisconnect = null
  #boundOnConnect = null
  #boundOnOnline = null
  #boundOnVisibilityChange = null

  constructor(diagnostics, journal = null) {
    this.#diagnostics = diagnostics
    this.#journal = journal
  }

  start() {
    this.#applyBackoffSettings()

    const socket = game.socket
    if (!socket) {
      console.warn(`${MODULE_ID} | game.socket indisponível, reconexão automática desativada`)
      return
    }

    this.#boundOnDisconnect = reason => this.#onDisconnect(reason)
    this.#boundOnConnect = () => this.#onConnect()
    this.#boundOnOnline = () => this.#forceReconnectAttempt()
    this.#boundOnVisibilityChange = () => {
      if (document.visibilityState === 'visible') this.#forceReconnectAttempt()
    }

    socket.on('disconnect', this.#boundOnDisconnect)
    socket.on('connect', this.#boundOnConnect)
    window.addEventListener('online', this.#boundOnOnline)
    document.addEventListener('visibilitychange', this.#boundOnVisibilityChange)
  }

  stop() {
    const socket = game.socket
    if (socket) {
      if (this.#boundOnDisconnect) socket.off('disconnect', this.#boundOnDisconnect)
      if (this.#boundOnConnect) socket.off('connect', this.#boundOnConnect)
    }
    if (this.#boundOnOnline) window.removeEventListener('online', this.#boundOnOnline)
    if (this.#boundOnVisibilityChange) {
      document.removeEventListener('visibilitychange', this.#boundOnVisibilityChange)
    }
    this.#hideBanner()
  }

  #applyBackoffSettings() {
    const enabled = game.settings.get(MODULE_ID, SETTINGS.AUTO_RECONNECT)
    const manager = game.socket?.io
    if (!manager) return

    if (enabled) {
      const maxDelaySeconds = Number(game.settings.get(MODULE_ID, SETTINGS.RECONNECT_MAX_DELAY))
      const maxDelay = (Number.isFinite(maxDelaySeconds) ? maxDelaySeconds : DEFAULTS.RECONNECT_MAX_DELAY_SECONDS) * 1000

      manager.reconnection(true)
      manager.reconnectionAttempts(Infinity)
      manager.reconnectionDelay(500)
      manager.reconnectionDelayMax(maxDelay)
      manager.randomizationFactor(0.3)
    }
  }

  #onDisconnect(reason) {
    this.#diagnostics.recordLocalDisconnect()
    this.#journal?.log(JOURNAL_TYPES.CONNECTION, { event: 'Desconectado', details: String(reason) })
    this.#showBanner(game.i18n.format('CONNGUARD.Banner.Disconnected', { reason }))
    console.warn(`${MODULE_ID} | desconectado do servidor (${reason})`)
  }

  #onConnect() {
    if (!this.#diagnostics.isCurrentlyDown()) return

    const entry = this.#diagnostics.recordLocalReconnect()
    this.#hideBanner()

    const seconds = entry ? (entry.durationMs / 1000).toFixed(1) : '?'
    this.#journal?.log(JOURNAL_TYPES.CONNECTION, { event: 'Reconectado', details: `${seconds}s fora do ar` })
    ui.notifications.info(game.i18n.format('CONNGUARD.Notif.Reconnected', { seconds }))
    console.log(`${MODULE_ID} | reconectado após ${seconds}s`)
  }

  #forceReconnectAttempt() {
    const socket = game.socket
    if (socket && !socket.connected) {
      console.log(`${MODULE_ID} | forçando nova tentativa de conexão`)
      socket.connect()
    }
  }

  #showBanner(message) {
    if (this.#bannerEl) {
      this.#bannerEl.textContent = message
      return
    }
    const el = document.createElement('div')
    el.id = 'connection-guard-banner'
    el.textContent = message
    document.body.appendChild(el)
    this.#bannerEl = el
  }

  #hideBanner() {
    this.#bannerEl?.remove()
    this.#bannerEl = null
  }
}
