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
 * UI: o botão do GM é um Scene Control nativo (hook getSceneControlButtons,
 * API v13 — ApplicationV2). Nada de botões fixed no DOM: o Foundry renderiza
 * o controle na paleta lateral padrão, funcionando em 13.350 → 14.999.
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

export const SCENE_CONTROL_NAME = 'connection-guard'
export const SCENE_CONTROL_ORDER = 20
export const GATE_TOOL_NAME = 'world-gate'

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
  #settingHookId = null
  #socketHandler = null
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

  get started() {
    return this.#started
  }

  start() {
    if (this.#started) return this
    this.#started = true

    this.#applyInitialGate()

    this.#settingHookId = Hooks.on('updateSetting', doc => {
      if (doc.key !== `${MODULE_ID}.${SETTINGS.GATE_LOCKED}`) return
      this.#onLockStateChanged(this.#readLocked())
    })

    this.#socketHandler = payload => this.#onSocketMessage(payload)
    game.socket?.on(SOCKET_EVENT, this.#socketHandler)

    return this
  }

  stop() {
    if (!this.#started) return this
    if (this.#settingHookId !== null) {
      Hooks.off('updateSetting', this.#settingHookId)
      this.#settingHookId = null
    }
    if (this.#socketHandler) {
      game.socket?.off(SOCKET_EVENT, this.#socketHandler)
      this.#socketHandler = null
    }
    this.#clearRedirectTimer()
    this.#removeOverlay()
    this.#started = false
    return this
  }

  // ------------------------------------------------------------------
  // Scene Control (API v13 — ApplicationV2)
  // ------------------------------------------------------------------

  /**
   * Registra o controle na paleta padrão do Foundry. Chamado pelo hook
   * getSceneControlButtons registrado no top-level do main.js (antes de
   * init/ready) para não perder o primeiro render da paleta. O controle
   * é visível apenas para GM. Tool é um toggle: `active` reflete o estado
   * do gate e o clique dispara `onChange`.
   */
  registerSceneControl(controls) {
    if (!this.#started) return
    if (game.user?.isGM !== true) return

    controls[SCENE_CONTROL_NAME] = {
      name: SCENE_CONTROL_NAME,
      order: SCENE_CONTROL_ORDER,
      title: game.i18n.localize('CONNGUARD.Gate.SceneControlTitle'),
      icon: 'fa-solid fa-shield-halved',
      visible: true,
      tools: {
        [GATE_TOOL_NAME]: {
          name: GATE_TOOL_NAME,
          order: 0,
          title: game.i18n.localize('CONNGUARD.Gate.ToolTitle'),
          icon: this.isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open',
          toggle: true,
          active: this.isLocked,
          onChange: (_event, active) => this.#onToolChange(active),
        },
      },
      activeTool: GATE_TOOL_NAME,
    }
  }

  /**
   * Chamado pelo toggle do Scene Control (API v13: onChange(event, active),
   * confirmado pela doc oficial foundryvtt.com/api/v13 e pelo type package).
   * Se o estado visual não bate com o gate real, aplica o toggle — evita
   * loop quando a mudança veio de outro cliente.
   */
  #onToolChange(active) {
    if (active !== this.isLocked) this.toggle()
  }

  /** Sincroniza o toggle do Scene Control com o estado real do gate. */
  #syncSceneControl() {
    try {
      ui.controls?.activate({ toggles: { [GATE_TOOL_NAME]: this.isLocked } })
    } catch (err) {
      console.warn(`${MODULE_ID} | falha ao sincronizar scene control`, err)
    }
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
    this.#syncSceneControl()
  }

  #onSocketMessage(payload) {
    if (payload?.type !== SOCKET_MESSAGES.GATE_CHANGED) return
    if (payload.locked === true) this.#onLockStateChanged(true)
    else this.#onLockStateChanged(false)
  }

  // ------------------------------------------------------------------
  // Toggle (chamado pelo Scene Control do GM)
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
  // UI: overlay do player
  // ------------------------------------------------------------------

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