import { MODULE_ID, SETTINGS, JOURNAL_TYPES } from './constants.js'
import { getActiveRoute } from './route-profiles.js'

/**
 * Chip fixo no HUD mostrando a rota ativa da mesa para TODOS os clientes
 * (GM e jogadores — mesma informação, mesma aparência).
 *
 * A rota ativa é um setting world não-restricted: quando o GM grava, o
 * Foundry sincroniza o valor para todos os clientes e o hook updateSetting
 * dispara aqui. O chip se atualiza sozinho, sem socket custom.
 *
 * - Jogador: vê a rota escolhida pelo Mestre com link "conectar".
 * - Notificação de troca apenas para quem não é GM (quem mudou já sabe).
 * - Botão ocultar: some até a próxima troca de rota (por sessão).
 */
export class ActiveRouteChip {
  #journal = null
  #el = null
  #hookId = null
  #dismissedForId = null

  constructor(journal = null) {
    this.#journal = journal
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
    this.#remove()
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

    const label = this.#el.querySelector('.connguard-active-route-chip-label')
    const link = this.#el.querySelector('.connguard-active-route-chip-link')
    const vpn = this.#el.querySelector('.connguard-active-route-chip-vpn')

    if (label) label.textContent = route.label
    if (link) link.href = route.url
    if (vpn) {
      vpn.textContent = route.requiresVpn ? game.i18n.localize('CONNGUARD.Service.RequiresVpn') : ''
      vpn.classList.toggle('connguard-hidden', !route.requiresVpn)
    }

    this.#dismissedForId = null
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
      <a class="connguard-active-route-chip-link" target="_blank" rel="noreferrer">
        ${game.i18n.localize('CONNGUARD.Service.ChipConnect')}
      </a>
      <button type="button" class="connguard-active-route-chip-dismiss" title="${game.i18n.localize('CONNGUARD.Service.ChipDismiss')}">×</button>
    `

    el.querySelector('.connguard-active-route-chip-dismiss')?.addEventListener('click', () => {
      this.#dismissedForId = getActiveRoute()?.id ?? null
      this.#remove()
    })

    document.body.appendChild(el)
    return el
  }
}
