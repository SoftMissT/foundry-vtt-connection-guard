import { MODULE_ID, SETTINGS, PLAYERS_RENDER_HOOKS } from './constants.js'

const LEVEL = {
  GOOD: 'connguard-good',
  LOW: 'connguard-low',
  BAD: 'connguard-bad',
}

export class PlayerListUI {
  #diagnostics
  #hookIds = []
  #renderPending = false

  constructor(diagnostics) {
    this.#diagnostics = diagnostics
  }

  registerHooks() {
    for (const hookName of PLAYERS_RENDER_HOOKS) {
      const id = Hooks.on(hookName, (_app, html) => this.#onRender(html))
      this.#hookIds.push({ hookName, id })
    }
  }

  destroy() {
    for (const { hookName, id } of this.#hookIds) {
      Hooks.off(hookName, id)
    }
    this.#hookIds = []
  }

  /** Chamado a cada amostra local ou recebida por socket. */
  refresh(userId) {
    this.#updateBadge(userId)
    if (!this.#renderPending) {
      this.#renderPending = true
      requestAnimationFrame(() => {
        this.#renderPending = false
        ui.players?.render?.()
      })
    }
  }

  #onRender(html) {
    const root = html instanceof HTMLElement ? html : html?.[0]
    if (!root) return

    for (const userId of this.#diagnostics.getAllUsers().keys()) {
      this.#updateBadge(userId, root)
    }
  }

  #findRoot() {
    return ui.players?.element instanceof HTMLElement ? ui.players.element : null
  }

  #updateBadge(userId, rootOverride = null) {
    const root = rootOverride ?? this.#findRoot()
    if (!root) return

    const data = this.#diagnostics.getUserData(userId)
    const hide = game.settings.get(MODULE_ID, SETTINGS.HIDE_LATENCY)
    const badgeId = `connection-guard-badge--${userId}`
    let badge = root.querySelector(`#${badgeId}`)

    if (!data || hide) {
      badge?.classList.add('connguard-hidden')
      return
    }

    if (!badge) {
      badge = this.#createBadge(root, userId, badgeId)
      if (!badge) return
    }

    badge.classList.remove('connguard-hidden')
    this.#paintBadge(badge, data)
  }

  #createBadge(root, userId, badgeId) {
    const row =
      root.querySelector(`li[data-user-id="${userId}"] .player-name`) ??
      root.querySelector(`[data-user-id="${userId}"]`)
    if (!row) return null

    const span = document.createElement('span')
    span.id = badgeId
    span.className = 'connguard-badge'
    row.insertAdjacentElement('afterend', span)
    return span
  }

  #paintBadge(badge, data) {
    const micro = game.settings.get(MODULE_ID, SETTINGS.MICRO_LATENCY)
    const showDiag = game.settings.get(MODULE_ID, SETTINGS.SHOW_DIAGNOSTICS_TOOLTIP)
    const level = data.stale ? LEVEL.BAD : this.#levelFor(data.average)

    badge.classList.remove(LEVEL.GOOD, LEVEL.LOW, LEVEL.BAD, 'connguard-micro', 'connguard-full')

    if (data.stale) {
      badge.classList.add(LEVEL.BAD, micro ? 'connguard-micro' : 'connguard-full')
      badge.innerHTML = micro ? '&#9888;' : game.i18n.localize('CONNGUARD.Badge.NoResponse')
      badge.title = game.i18n.localize('CONNGUARD.Badge.NoResponseTitle')
      return
    }

    badge.classList.add(level, micro ? 'connguard-micro' : 'connguard-full')

    if (micro) {
      badge.innerHTML = level === LEVEL.GOOD ? '+' : level === LEVEL.LOW ? '&nbsp;' : '-'
    } else {
      badge.innerHTML = `${data.average}<em>ms</em>`
    }

    badge.title = showDiag
      ? game.i18n.format('CONNGUARD.Badge.Tooltip', {
          average: data.average,
          jitter: data.jitter ?? '?',
          loss: data.lossPct ?? 0,
        })
      : `${data.average}ms`
  }

  #levelFor(average) {
    if (average <= 100) return LEVEL.GOOD
    if (average < 250) return LEVEL.LOW
    return LEVEL.BAD
  }
}
