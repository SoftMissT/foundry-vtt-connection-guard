import { SOCKET_EVENT, SOCKET_MESSAGES, JOURNAL_TYPES } from './constants.js'
import { getConfiguredRouteProfiles, routeProfilesExample, escapeHtml } from './route-profiles.js'
import { RouteScanner } from './route-scanner.js'
import { pickBestRoute } from './route-score.js'

/**
 * Route Oracle / Abyss Link.
 * Abre um painel para GM ou jogador, mede as rotas configuradas e envia
 * o resultado para os outros clientes via socket do Foundry.
 */
export class RouteWizard {
  #diagnostics
  #journal
  #scanner

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

    const report = await this.#scanner.scanAll(profiles)
    this.#diagnostics?.recordRouteReport(report)
    this.#journal?.log(JOURNAL_TYPES.ROUTE, report)

    game.socket?.emit(SOCKET_EVENT, {
      type: SOCKET_MESSAGES.ROUTE_SCAN_RESULT,
      report,
    })

    return this.#showReport(report)
  }

  async #showNoProfiles() {
    const content = `
      <section class="connguard-panel connguard-abyss">
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
      position: { width: 680 },
    })
  }

  async #showReport(report) {
    const best = pickBestRoute(report.results)
    const rows = report.results.map(result => this.#resultRow(result, best?.id)).join('')

    const bestBlock = best
      ? `
        <div class="connguard-route-best ${best.cssClass}">
          <strong>${game.i18n.localize('CONNGUARD.Route.Best')}:</strong>
          ${escapeHtml(best.label)}
          <span>${best.medianMs}ms · score ${best.score}</span>
          <a href="${escapeHtml(best.url)}" target="_blank" rel="noreferrer">${game.i18n.localize('CONNGUARD.Route.Open')}</a>
        </div>
      `
      : `<p class="connguard-route-sealed">${game.i18n.localize('CONNGUARD.Route.NoReachable')}</p>`

    const content = `
      <section class="connguard-panel connguard-abyss">
        <h2>${game.i18n.localize('CONNGUARD.Route.WindowTitle')}</h2>
        <p class="connguard-muted">${game.i18n.format('CONNGUARD.Route.ReportFor', {
          user: escapeHtml(report.userName ?? report.userId ?? '?'),
          ms: report.durationMs,
        })}</p>
        ${bestBlock}
        <table class="connguard-table connguard-route-table">
          <thead>
            <tr>
              <th>${game.i18n.localize('CONNGUARD.Route.Label')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Type')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Median')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Jitter')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Loss')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Score')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Status')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.Route.LimitNote')}</p>
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
      position: { width: 780 },
    })
  }

  #resultRow(result, bestId) {
    const value = v => v ?? '—'
    const bestMark = result.id === bestId ? ' ★' : ''
    const status = result.statusKey ? game.i18n.localize(result.statusKey) : '—'
    const hint = result.hintKey ? ` title="${escapeHtml(game.i18n.localize(result.hintKey))}"` : ''

    return `
      <tr class="${result.cssClass}"${hint}>
        <td><a href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">${escapeHtml(result.label)}${bestMark}</a></td>
        <td>${escapeHtml(result.type)}</td>
        <td>${value(result.medianMs)}</td>
        <td>${value(result.jitterMs)}</td>
        <td>${value(result.lossPct)}%</td>
        <td>${Number.isFinite(result.score) ? result.score : '∞'}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `
  }
}
