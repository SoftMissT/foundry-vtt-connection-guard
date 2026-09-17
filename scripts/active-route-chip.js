import { MODULE_ID, SETTINGS, JOURNAL_TYPES } from './constants.js'
import { getActiveRoute, routeConnectionState } from './route-profiles.js'
import { REDUNDANCY_MODES, REDUNDANCY_STATES, CURRENT_ROUTES } from './route-redundancy-manager.js'

/**
 * Chip fixo no HUD mostrando a rota RUNTIME da mesa para TODOS os clientes
 * (GM e jogadores mesma informação, mesma aparência).
 *
 * A rota ativa é um setting world não-restricted: quando o GM grava, o
 * Foundry sincroniza o valor para todos os clientes e o hook updateSetting
 * dispara aqui. O chip se atualiza sozinho, sem socket custom.
 *
 * O estado visual (PRIMARY / RADMIN fallback / RADMIN only / rota diferente)
 * é resolvido pela MESMA instância do RouteRedundancyManager. O chip NUNCA
 * recalcula redundância nem duplica resolveRedundancyMode/resolveCurrentRoute/
 * isValidRadminUrl — consome o estado já resolvido.
 *
 * - Jogador: vê a rota escolhida pelo Mestre com link "conectar".
 * - Notificação de troca apenas para quem não é GM (quem mudou já sabe).
 * - Botão ocultar: some até a próxima troca de rota (por sessão).
 * - Auto-dismiss: chip some automaticamente após 15 s com fade-out.
 */

const AUTO_DISMISS_MS = 15_000
const FADE_OUT_MS = 500

/**
 * Resolve a apresentação do chip a partir do estado JÁ resolvido pelo
 * RouteRedundancyManager. Função pura (sem game/i18n) e testável em Node.
 *
 * Descriptor: { kind, label, labelKey, stateKey, fallback }
 * - label: texto literal (label do ACTIVE_ROUTE configurada pelo GM).
 * - labelKey: chave i18n quando o texto principal é localizado.
 * - stateKey: chave i18n do status secundário (ou null).
 * - fallback: true quando a rota exibida é o fallback Radmin.
 */
export function resolveChipView(route, mode, currentRoute, state) {
  const baseLabel = route?.label ?? ''

  if (currentRoute === CURRENT_ROUTES.NONE) {
    return {
      kind: 'unknown',
      label: baseLabel,
      labelKey: null,
      stateKey: 'CONNGUARD.Chip.DifferentRoute',
      fallback: false,
    }
  }

  if (mode === REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN) {
    if (currentRoute === CURRENT_ROUTES.RADMIN) {
      return {
        kind: 'radmin-fallback',
        label: null,
        labelKey: 'CONNGUARD.Chip.RadminFallback',
        stateKey: 'CONNGUARD.Chip.FallbackActive',
        fallback: true,
      }
    }
    if (state === REDUNDANCY_STATES.PRIMARY_RETRYING) {
      return {
        kind: 'retrying',
        label: baseLabel,
        labelKey: null,
        stateKey: 'CONNGUARD.Chip.Reconnecting',
        fallback: false,
      }
    }
    if (state === REDUNDANCY_STATES.RADMIN_FAILOVER) {
      return {
        kind: 'failover',
        label: baseLabel,
        labelKey: null,
        stateKey: 'CONNGUARD.Chip.Switching',
        fallback: true,
      }
    }
    return { kind: 'primary', label: baseLabel, labelKey: null, stateKey: null, fallback: false }
  }

  if (mode === REDUNDANCY_MODES.RADMIN_ONLY) {
    return {
      kind: 'radmin-only',
      label: baseLabel,
      labelKey: null,
      stateKey: null,
      fallback: false,
    }
  }

  if (mode === REDUNDANCY_MODES.PRIMARY_ONLY) {
    return { kind: 'primary', label: baseLabel, labelKey: null, stateKey: null, fallback: false }
  }

  // UNSUPPORTED / sem redundância configurada: mostra a rota configurada.
  return { kind: 'primary', label: baseLabel, labelKey: null, stateKey: null, fallback: false }
}

export class ActiveRouteChip {
  #journal = null
  #redundancyManager = null
  #el = null
  #hookId = null
  #dismissedForId = null
  #autoDismissTimer = null

  constructor(journal = null, redundancyManager = null) {
    this.#journal = journal
    this.#redundancyManager = redundancyManager
  }

  start() {
    this.#render(false)

    this.#hookId = Hooks.on('updateSetting', doc => {
      if (doc.key !== `${MODULE_ID}.${SETTINGS.ACTIVE_ROUTE}`) return
      this.#dismissedForId = null
      this.#render(true)
    })
  }

  stop() {
    if (this.#hookId !== null) {
      Hooks.off('updateSetting', this.#hookId)
      this.#hookId = null
    }
    this.#clearAutoDismiss()
    this.#remove()
  }

  #clearAutoDismiss() {
    if (this.#autoDismissTimer !== null) {
      clearTimeout(this.#autoDismissTimer)
      this.#autoDismissTimer = null
    }
  }

  #scheduleAutoDismiss() {
    this.#clearAutoDismiss()
    this.#autoDismissTimer = setTimeout(() => {
      this.#autoDismissTimer = null
      if (!this.#el) return
      this.#el.classList.add('connguard-chip-leaving')
      setTimeout(() => {
        this.#dismissedForId = getActiveRoute()?.id ?? null
        this.#remove()
      }, FADE_OUT_MS)
    }, AUTO_DISMISS_MS)
  }

  #remove() {
    this.#el?.remove()
    this.#el = null
  }

  #render(notify) {
    const route = getActiveRoute()

    if (!route) {
      this.#remove()
      return
    }

    if (this.#dismissedForId === route.id) {
      this.#remove()
      return
    }

    if (notify) {
      if (!game.user?.isGM) {
        ui.notifications.info(
          game.i18n.format('CONNGUARD.Service.SelectedNotif', { label: route.label }),
        )
      }

      this.#journal?.log(JOURNAL_TYPES.ROUTE, {
        event: 'route-selected',
        label: route.label,
        type: route.type,
        url: route.url,
      })
    }

    if (!this.#el) {
      this.#el = this.#create()
      if (!this.#el) return
    }

    const view = this.#resolveView(route)

    const label = this.#el.querySelector('.connguard-active-route-chip-label')
    const link = this.#el.querySelector('.connguard-active-route-chip-link')
    const vpn = this.#el.querySelector('.connguard-active-route-chip-vpn')
    const state = this.#el.querySelector('.connguard-active-route-chip-state')

    if (label) label.textContent = view.labelKey ? game.i18n.localize(view.labelKey) : view.label
    if (link) {
      const hideLink = view.kind === 'radmin-fallback' || view.kind === 'unknown'
      link.href = route.url
      link.classList.toggle('connguard-hidden', hideLink)
    }
    if (vpn) {
      const requiresVpn =
        route.requiresVpn || view.kind === 'radmin-fallback' || view.kind === 'radmin-only'
      vpn.textContent = requiresVpn ? game.i18n.localize('CONNGUARD.Service.RequiresVpn') : ''
      vpn.classList.toggle('connguard-hidden', !requiresVpn)
    }
    if (state) {
      if (view.stateKey) {
        state.textContent = game.i18n.localize(view.stateKey)
        state.classList.toggle('connguard-route-mismatch', view.kind === 'unknown')
      } else {
        const alignment = routeConnectionState(route)
        state.textContent = alignment.matchesCurrent
          ? game.i18n.localize('CONNGUARD.Service.Current')
          : game.i18n.localize('CONNGUARD.Service.ReloadHint')
        state.classList.toggle('connguard-route-mismatch', !alignment.matchesCurrent)
      }
    }

    this.#dismissedForId = null
    this.#scheduleAutoDismiss()
  }

  #resolveView(route) {
    const mgr = this.#redundancyManager
    if (!mgr) {
      return {
        kind: 'primary',
        label: route.label,
        labelKey: null,
        stateKey: null,
        fallback: false,
      }
    }
    return resolveChipView(route, mgr.mode, mgr.currentRoute, mgr.state)
  }

  #create() {
    const el = document.createElement('div')
    el.id = 'connguard-active-route-chip'
    el.className = 'connguard-active-route-chip'

    el.innerHTML = `
      <span class="connguard-active-route-chip-title">
        ${game.i18n.localize('CONNGUARD.Service.ActiveTitle')}
      </span>
      <span class="connguard-active-route-chip-label"></span>
      <span class="connguard-active-route-chip-vpn connguard-hidden"></span>
      <span class="connguard-active-route-chip-state"></span>
      <a class="connguard-active-route-chip-link" target="_blank" rel="noreferrer">
        ${game.i18n.localize('CONNGUARD.Service.ChipConnect')}
      </a>
      <button type="button" class="connguard-active-route-chip-dismiss" title="${game.i18n.localize('CONNGUARD.Service.ChipDismiss')}">×</button>
    `

    el.querySelector('.connguard-active-route-chip-dismiss')?.addEventListener('click', () => {
      this.#clearAutoDismiss()
      this.#dismissedForId = getActiveRoute()?.id ?? null
      this.#remove()
    })

    document.body.appendChild(el)
    return el
  }
}
