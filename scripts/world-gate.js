import {
  MODULE_ID,
  SETTINGS,
  SOCKET_EVENT,
  SOCKET_MESSAGES,
  DEFAULTS,
  JOURNAL_TYPES,
} from './constants.js'

/**
 * World Gate — abre/fecha a mesa para jogadores (GM).
 *
 * Objetivo: impedir que jogadores entrem no mundo enquanto a conexão está
 * fechada, e expulsar quem já está dentro. O Connection Guard não bloqueava
 * login (a autenticação acontece no servidor, antes de qualquer módulo);
 * fechar rotas/túneis nunca teve efeito sobre permissão de entrada.
 *
 * Mecanismo (o único gate real que o Foundry expõe ao módulo):
 * - FECHAR: salva os roles atuais dos players (backup) e define role NONE
 *   (ban nativo) em todos os não-GM. Role NONE impede login no servidor.
 * - ABRIR: restaura os roles salvos.
 * - Self-eject: players conectados recebem o estado via updateSetting/socket
 *   e mostram um overlay full-screen + redirecionam ao login.
 *
 * Regras:
 * - GM e Assistentes (isGM) NUNCA são tocados.
 * - O gate não altera rotas, fallback Radmin, firewall ou túneis.
 * - As funções puras (fora da classe) não acessam game/window/document no
 *   top-level — testáveis em Node, como o RouteRedundancyManager.
 */

const ROLE_NONE = 0

export const GATE_STATES = {
  OPEN: 'open',
  CLOSED: 'closed',
}

/** Interpreta o valor do setting GATE_LOCKED. Nunca lança. */
export function gateStateFromSetting(locked) {
  return locked === true ? GATE_STATES.CLOSED : GATE_STATES.OPEN
}

/**
 * Aplica o gate ao próprio cliente. Apenas não-GM é expulso quando fechado;
 * o GM/Assistente nunca é tocado.
 */
export function shouldEjectSelf(isGM, locked) {
  return isGM !== true && locked === true
}

/**
 * Coleta { id, role } dos usuários NÃO-GM (GM/Assistente ficam de fora).
 * Usado como backup antes de aplicar o ban.
 */
export function collectRoleBackup(users) {
  const backup = []
  for (const user of users ?? []) {
    if (!user || user.isGM === true) continue
    if (user.id === undefined || user.id === null) continue
    backup.push({ id: user.id, role: user.role })
  }
  return backup
}

/** Parse seguro do backup de roles (string JSON). Retorna [] se inválido. */
export function parseRolesBackup(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(entry => entry && typeof entry.id === 'string' && Number.isFinite(Number(entry.role)))
      .map(entry => ({ id: entry.id, role: Number(entry.role) }))
  } catch {
    return []
  }
}

/**
 * Calcula os updates de restauração de role. Restaura apenas os usuários
 * que (a) estão no backup E (b) estão atualmente com role NONE — nunca
 * sobrescreve uma role que o GM mudou manualmente durante o bloqueio.
 */
export function resolveRestoreUpdates(users, backup) {
  const savedByUser = new Map()
  for (const entry of backup ?? []) {
    savedByUser.set(entry.id, Number(entry.role))
  }

  const updates = []
  for (const user of users ?? []) {
    if (!user || user.isGM === true) continue
    const saved = savedByUser.get(user.id)
    if (saved === undefined) continue
    if (user.role !== ROLE_NONE) continue
    updates.push({ _id: user.id, role: saved })
  }
  return updates
}

/** Filtra os usuários não-GM que ainda não estão banidos (role != NONE). */
export function resolveBanUpdates(users) {
  const updates = []
  for (const user of users ?? []) {
    if (!user || user.isGM === true) continue
    if (user.role === ROLE_NONE) continue
    updates.push({ _id: user.id, role: ROLE_NONE })
  }
  return updates
}

export class WorldGate {
  #journal = null
  #hookId = null
  #socketHandler = null
  #buttonEl = null
  #overlayEl = null
  #redirectTimer = null
  #redirectIssued = false
  #started = false

  constructor(journal = null) {
    this.#journal = journal
  }

  get state() {
    const locked = this.#readLocked()
    return gateStateFromSetting(locked)
  }

  get isLocked() {
    return this.#readLocked() === true
  }

  start() {
    if (this.#started) return this
    this.#started = true

    this.#applyInitialGate()
    this.#renderButton()

    this.#hookId = Hooks.on('updateSetting', doc => {
      if (doc.key !== `${MODULE_ID}.${SETTINGS.GATE_LOCKED}`) return
      this.#onLockStateChanged(this.#readLocked())
    })

    this.#socketHandler = payload => this.#onSocketMessage(payload)
    game.socket?.on(SOCKET_EVENT, this.#socketHandler)

    return this
  }

  stop() {
    if (!this.#started) return this
    if (this.#hookId !== null) {
      Hooks.off('updateSetting', this.#hookId)
      this.#hookId = null
    }
    if (this.#socketHandler) {
      game.socket?.off(SOCKET_EVENT, this.#socketHandler)
      this.#socketHandler = null
    }
    this.#clearRedirectTimer()
    this.#removeButton()
    this.#removeOverlay()
    this.#started = false
    return this
  }

  /**
   * Aplica o gate no ready: expulsa o próprio cliente se a mesa estiver
   * fechada e o usuário não for GM. Idempotente.
   */
  #applyInitialGate() {
    const locked = this.#readLocked()
    this.#onLockStateChanged(locked)
  }

  #onLockStateChanged(locked) {
    if (shouldEjectSelf(game.user?.isGM, locked)) {
      this.#ejectSelf()
    } else if (!locked) {
      this.#cancelRedirect()
      this.#removeOverlay()
    }
    this.#updateButton()
  }

  #onSocketMessage(payload) {
    if (payload?.type !== SOCKET_MESSAGES.GATE_CHANGED) return
    if (payload.locked === true) this.#onLockStateChanged(true)
    else this.#onLockStateChanged(false)
  }

  // ------------------------------------------------------------------
  // Toggle (chamado pelo botão do GM)
  // ------------------------------------------------------------------

  async toggle() {
    if (!game.user?.isGM) {
      ui.notifications?.warn(game.i18n.localize('CONNGUARD.Gate.GmOnly'))
      return
    }
    if (this.isLocked) await this.#unlock()
    else await this.#lock()
  }

  async #lock() {
    if (this.isLocked) return

    const users = [...game.users]
    const backup = collectRoleBackup(users)
    const banUpdates = resolveBanUpdates(users)

    await game.settings.set(MODULE_ID, SETTINGS.GATE_ROLES_BACKUP, JSON.stringify(backup))
    if (banUpdates.length) {
      await User.updateDocuments(banUpdates)
    }
    await game.settings.set(MODULE_ID, SETTINGS.GATE_LOCKED, true)

    this.#journal?.log(JOURNAL_TYPES.CONNECTION, {
      event: 'gate-locked',
      banned: banUpdates.length,
    })
    ui.notifications?.info(game.i18n.localize('CONNGUARD.Gate.LockedNotif'))
    game.socket?.emit(SOCKET_EVENT, { type: SOCKET_MESSAGES.GATE_CHANGED, locked: true })
  }

  async #unlock() {
    if (!this.isLocked) return

    const backup = parseRolesBackup(
      game.settings.get(MODULE_ID, SETTINGS.GATE_ROLES_BACKUP),
    )
    const users = [...game.users]
    const restoreUpdates = resolveRestoreUpdates(users, backup)

    if (restoreUpdates.length) {
      await User.updateDocuments(restoreUpdates)
    }
    await game.settings.set(MODULE_ID, SETTINGS.GATE_ROLES_BACKUP, '')
    await game.settings.set(MODULE_ID, SETTINGS.GATE_LOCKED, false)

    this.#journal?.log(JOURNAL_TYPES.CONNECTION, {
      event: 'gate-unlocked',
      restored: restoreUpdates.length,
    })
    ui.notifications?.info(game.i18n.localize('CONNGUARD.Gate.UnlockedNotif'))
    game.socket?.emit(SOCKET_EVENT, { type: SOCKET_MESSAGES.GATE_CHANGED, locked: false })
  }

  // ------------------------------------------------------------------
  // Self-eject (players)
  // ------------------------------------------------------------------

  #ejectSelf() {
    if (this.#redirectIssued) return
    this.#redirectIssued = true
    this.#showOverlay()
    this.#clearRedirectTimer()
    this.#redirectTimer = setTimeout(() => {
      this.#redirectTimer = null
      const prefix = game.data?.routePrefix || ''
      const target = prefix
        ? `${globalThis.location.origin}${prefix}`
        : globalThis.location.origin
      globalThis.location.href = target
    }, DEFAULTS.GATE_REDIRECT_DELAY_MS)
  }

  #cancelRedirect() {
    this.#clearRedirectTimer()
  }

  #clearRedirectTimer() {
    if (this.#redirectTimer !== null) {
      clearTimeout(this.#redirectTimer)
      this.#redirectTimer = null
    }
  }

  // ------------------------------------------------------------------
  // UI: botão do GM + overlay do player
  // ------------------------------------------------------------------

  #renderButton() {
    if (!game.user?.isGM || this.#buttonEl) return

    const el = document.createElement('button')
    el.type = 'button'
    el.id = 'connguard-world-gate-button'
    el.className = 'connguard-world-gate-button'
    el.addEventListener('click', () => this.toggle())
    document.body.appendChild(el)
    this.#buttonEl = el
    this.#updateButton()
  }

  #updateButton() {
    const el = this.#buttonEl
    if (!el) return
    const locked = this.isLocked
    el.classList.toggle('connguard-gate-locked', locked)
    el.classList.toggle('connguard-gate-open', !locked)
    el.innerHTML = locked
      ? `<i class="fas fa-lock"></i> ${game.i18n.localize('CONNGUARD.Gate.CloseButton')}`
      : `<i class="fas fa-unlock"></i> ${game.i18n.localize('CONNGUARD.Gate.OpenButton')}`
    el.title = locked
      ? game.i18n.localize('CONNGUARD.Gate.CloseHint')
      : game.i18n.localize('CONNGUARD.Gate.OpenHint')
  }

  #removeButton() {
    this.#buttonEl?.remove()
    this.#buttonEl = null
  }

  #showOverlay() {
    if (this.#overlayEl) return

    const overlay = document.createElement('div')
    overlay.id = 'connguard-gate-overlay'
    overlay.className = 'connguard-gate-overlay'

    const box = document.createElement('div')
    box.className = 'connguard-gate-overlay-box'

    const title = document.createElement('h2')
    title.textContent = game.i18n.localize('CONNGUARD.Gate.ClosedTitle')

    const hint = document.createElement('p')
    hint.textContent = game.i18n.localize('CONNGUARD.Gate.ClosedHint')

    box.append(title, hint)
    overlay.append(box)
    document.body.appendChild(overlay)
    this.#overlayEl = overlay
  }

  #removeOverlay() {
    this.#overlayEl?.remove()
    this.#overlayEl = null
  }

  // ------------------------------------------------------------------

  #readLocked() {
    return game.settings.get(MODULE_ID, SETTINGS.GATE_LOCKED) === true
  }
}