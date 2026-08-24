import { MODULE_ID, SETTINGS, DEFAULTS } from './constants.js'

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
  #bannerEl = null

  constructor(diagnostics) {
    this.#diagnostics = diagnostics
  }

  start() {
    this.#applyBackoffSettings()

    const socket = game.socket
    if (!socket) {
      console.warn(`${MODULE_ID} | game.socket indisponível, reconexão automática desativada`)
      return
    }

    socket.on('disconnect', reason => this.#onDisconnect(reason))
    socket.on('connect', () => this.#onConnect())

    window.addEventListener('online', () => this.#forceReconnectAttempt())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.#forceReconnectAttempt()
    })
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
    this.#showBanner(game.i18n.format('CONNGUARD.Banner.Disconnected', { reason }))
    console.warn(`${MODULE_ID} | desconectado do servidor (${reason})`)
  }

  #onConnect() {
    if (!this.#diagnostics.isCurrentlyDown()) return // primeira conexão, não é reconexão

    const entry = this.#diagnostics.recordLocalReconnect()
    this.#hideBanner()

    const seconds = entry ? (entry.durationMs / 1000).toFixed(1) : '?'
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
