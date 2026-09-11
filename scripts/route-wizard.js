import { SOCKET_EVENT, SOCKET_MESSAGES, JOURNAL_TYPES } from './constants.js'
import {
  getConfiguredRouteProfiles,
  getActiveRoute,
  setActiveRoute,
  routeProfilesExample,
  escapeHtml,
} from './route-profiles.js'
import { RouteScanner } from './route-scanner.js'
import { pickBestRoute } from './route-score.js'

/**
 * Route Oracle / Abyss Link.
 * Abre um painel para GM ou jogador, mede as rotas configuradas e envia
 * o resultado para os outros clientes via socket do Foundry.
 *
 * v3.1.0:
 * - O dialog abre IMEDIATAMENTE com estado "escaneando" por linha; cada
 *   rota resolvida é pintada na hora (scanAll + onProgress). Nunca mais
 *   tela congelada esperando rotas mortas (ex.: Radmin VPN free caído).
 * - Mostra a rota ativa da mesa escolhida pelo GM, com link para conectar.
 * - GM define a rota ativa direto da tabela (★ por linha).
 */
export class RouteWizard {
  #diagnostics
  #journal
  #scanner
  #dialog = null
  #results = new Map()
  #expectedTotal = 0

  constructor(diagnostics, journal) {
    this.#diagnostics = diagnostics
    this.#journal = journal
    this.#scanner = new RouteScanner(journal)
  }

  async render(_force) {
    const profiles = getConfiguredRouteProfiles()

    if (!profiles.length) {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.Route.NoProfiles'))
      return this.#showNoProfiles()
    }

    ui.notifications.info(game.i18n.localize('CONNGUARD.Route.ScanStarted'))

    const dialogPromise = this.#showScanningDialog(profiles)

    const report = await this.#scanner.scanAll(profiles, result => this.#onRouteResolved(result))
    this.#diagnostics?.recordRouteReport(report)
    this.#journal?.log(JOURNAL_TYPES.ROUTE, report)

    game.socket?.emit(SOCKET_EVENT, {
      type: SOCKET_MESSAGES.ROUTE_SCAN_RESULT,
      report,
    })

    return dialogPromise
  }

  async #showNoProfiles() {
    const content = `
      <section class="connguard-panel connguard-abyss connguard-route-oracle">
        <h2>${game.i18n.localize('CONNGUARD.Route.WindowTitle')}</h2>
        <p>${game.i18n.localize('CONNGUARD.Route.NoProfilesHelp')}</p>
        <pre class="connguard-route-example">${escapeHtml(routeProfilesExample())}</pre>
      </section>
    `

    return foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize('CONNGUARD.Route.WindowTitle') },
      content,
      buttons: [
        {
          action: 'close',
          label: game.i18n.localize('CONNGUARD.Panel.Close'),
          default: true,
        },
      ],
      position: { width: 760 },
    })
  }

  async #showScanningDialog(profiles) {
    this.#results = new Map()
    this.#expectedTotal = profiles.length

    const active = getActiveRoute()
    const rows = profiles.map(profile => this.#scanningRow(profile)).join('')
    const actionHead = game.user?.isGM
      ? `<th>${game.i18n.localize('CONNGUARD.Service.ActiveTitle')}</th>`
      : ''

    const content = `
      <section class="connguard-panel connguard-abyss connguard-route-oracle">
        <h2>${game.i18n.localize('CONNGUARD.Route.WindowTitle')}</h2>

        ${this.#activeBlock(active)}

        <div id="connguard-route-best" class="connguard-route-best connguard-route-scanning-block">
          <span class="connguard-route-scanning">${game.i18n.localize('CONNGUARD.Route.Scanning')}</span>
        </div>

        <div class="connguard-table-wrap">
          <table class="connguard-table connguard-route-table">
            <thead>
              <tr>
                <th>${game.i18n.localize('CONNGUARD.Route.Label')}</th>
                <th>${game.i18n.localize('CONNGUARD.Route.Type')}</th>
                <th>${game.i18n.localize('CONNGUARD.Route.Median')}</th>
                <th>${game.i18n.localize('CONNGUARD.Route.Jitter')}</th>
                <th>${game.i18n.localize('CONNGUARD.Route.Loss')}</th>
                <th>${game.i18n.localize('CONNGUARD.Route.Score')}</th>
                <th>${game.i18n.localize('CONNGUARD.Route.StatusLabel')}</th>
                ${actionHead}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.Route.LimitNote')}</p>
      </section>
    `

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize('CONNGUARD.Route.WindowTitle') },
      content,
      buttons: [
        {
          action: 'close',
          label: game.i18n.localize('CONNGUARD.Panel.Close'),
          default: true,
        },
      ],
      position: { width: game.user?.isGM ? 940 : 860 },
    })

    await dialog.render({ force: true })
    this.#dialog = dialog

    if (game.user?.isGM) {
      dialog.element?.addEventListener('click', event => {
        const button = event.target.closest('[data-connguard-set-active]')
        if (!button) return
        const result = this.#results.get(button.dataset.connguardSetActive)
        if (result) this.#selectActiveRoute(result)
      })
    }

    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve('close'))
    })
  }

  #scanningRow(profile) {
    return `
      <tr id="connguard-route-row--${profile.id}" class="connguard-route-scanning-row">
        <td>
          <a href="${escapeHtml(profile.url)}" target="_blank" rel="noreferrer">
            ${escapeHtml(profile.label)}
          </a>
        </td>
        <td>${escapeHtml(profile.type)}</td>
        <td colspan="5" class="connguard-route-scanning">
          ${game.i18n.localize('CONNGUARD.Route.Scanning')}
        </td>
      </tr>
    `
  }

  #onRouteResolved(result) {
    this.#results.set(result.id, result)

    const root = this.#dialog?.element
    if (!root || !this.#dialog?.rendered) return

    const row = root.querySelector(`#connguard-route-row--${result.id}`)
    if (row) row.outerHTML = this.#resultRow(result, getActiveRoute()?.id)

    const bestBlock = root.querySelector('#connguard-route-best')
    if (bestBlock) bestBlock.outerHTML = this.#bestBlock([...this.#results.values()])
  }

  async #selectActiveRoute(result) {
    const route = await setActiveRoute(result)
    if (!route) return

    ui.notifications.info(game.i18n.format('CONNGUARD.Service.ActiveSet', { label: route.label }))

    const root = this.#dialog?.element
    if (!root) return

    const block = root.querySelector('#connguard-active-route-block')
    if (block) block.outerHTML = this.#activeBlock(route)

    for (const item of this.#results.values()) {
      const row = root.querySelector(`#connguard-route-row--${item.id}`)
      if (row) row.outerHTML = this.#resultRow(item, route.id)
    }
  }

  #activeBlock(active) {
    if (!active) return ''

    const vpnTag = active.requiresVpn
      ? ` · <span class="connguard-service-pill">${game.i18n.localize('CONNGUARD.Service.RequiresVpn')}</span>`
      : ''

    return `
      <div id="connguard-active-route-block" class="connguard-active-route-banner">
        <div>
          <strong>${game.i18n.localize('CONNGUARD.Service.ActiveTitle')}</strong>
          <span>${escapeHtml(active.label)}${vpnTag}</span>
        </div>
        <a href="${escapeHtml(active.url)}" target="_blank" rel="noreferrer">
          ${game.i18n.localize('CONNGUARD.Route.Open')}
        </a>
      </div>
    `
  }

  #bestBlock(results) {
    const best = pickBestRoute(results)

    if (!best) {
      if (this.#results.size < this.#expectedTotal) {
        return `
          <div id="connguard-route-best" class="connguard-route-best connguard-route-scanning-block">
            <span class="connguard-route-scanning">${game.i18n.localize('CONNGUARD.Route.Scanning')}</span>
          </div>
        `
      }

      return `
        <div id="connguard-route-best" class="connguard-route-sealed">
          ${game.i18n.localize('CONNGUARD.Route.NoReachable')}
        </div>
      `
    }

    return `
      <div id="connguard-route-best" class="${best.cssClass}">
        <div>
          <strong>${game.i18n.localize('CONNGUARD.Route.Best')}</strong>
          <span>${escapeHtml(best.label)}</span>
        </div>
        <div class="connguard-route-best-meta">
          <span>${best.medianMs}ms · score ${best.score}</span>
          <a href="${escapeHtml(best.url)}" target="_blank" rel="noreferrer">
            ${game.i18n.localize('CONNGUARD.Route.Open')}
          </a>
        </div>
      </div>
    `
  }

  #resultRow(result, activeId) {
    const value = v => v ?? '—'
    const best = pickBestRoute([...this.#results.values()])
    const bestMark = result.id === best?.id ? ' ★' : ''
    const isActive = result.id === activeId
    const status = result.statusKey ? game.i18n.localize(result.statusKey) : '—'
    const hintKey = result.hintKey ?? null
    const hint = hintKey ? ` title="${escapeHtml(game.i18n.localize(hintKey))}"` : ''
    const activeClass = isActive ? ' connguard-route-active-row' : ''
    const activeMark = isActive
      ? ` <span class="connguard-service-pill connguard-service-pill-active">${game.i18n.localize('CONNGUARD.Service.ActiveBadge')}</span>`
      : ''

    const actionCell = game.user?.isGM
      ? `
        <td>
          <button
            type="button"
            class="connguard-set-active"
            data-connguard-set-active="${escapeHtml(result.id)}"
            ${isActive ? 'disabled' : ''}
            title="${escapeHtml(game.i18n.localize('CONNGUARD.Service.SetActive'))}"
          >★</button>
        </td>
      `
      : ''

    return `
      <tr id="connguard-route-row--${result.id}" class="${result.cssClass}${activeClass}"${hint}>
        <td>
          <a href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">
            ${escapeHtml(result.label)}${bestMark}${activeMark}
          </a>
        </td>
        <td>${escapeHtml(result.type)}</td>
        <td>${value(result.medianMs)}</td>
        <td>${value(result.jitterMs)}</td>
        <td>${value(result.lossPct)}%</td>
        <td>${Number.isFinite(result.score) ? result.score : '∞'}</td>
        <td>${escapeHtml(status)}</td>
        ${actionCell}
      </tr>
    `
  }
}
