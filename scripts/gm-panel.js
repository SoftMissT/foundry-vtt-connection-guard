import { MODULE_TITLE } from './constants.js'
import { escapeHtml } from './route-profiles.js'

/**
 * Janela somente-leitura para o GM: latência, jitter e perda estimada de
 * cada usuário conectado, histórico de quedas, alertas de degradação,
 * matriz de rotas Abyss Link, e exportador manual de journal.
 * Implementado como DialogV2, com exportador separado em ApplicationV2.
 */
export class GmPanel {
  #diagnostics
  #journal

  constructor(diagnostics, journal) {
    this.#diagnostics = diagnostics
    this.#journal = journal
  }

  async render(_force) {
    const rows = this.#buildRows()
    const routeOracle = this.#buildRouteOracle()
    const drops = this.#buildDrops()
    const degradation = this.#buildDegradation()
    const journalInfo = this.#journal
      ? `<p class="connguard-muted">${game.i18n.format('CONNGUARD.Panel.JournalEntries', { count: this.#journal.entryCount })}</p>`
      : ''

    const content = `
      <section class="connguard-panel connguard-abyss connguard-gm-panel">
        <h3>${game.i18n.localize('CONNGUARD.Panel.UsersTitle')}</h3>

        <div class="connguard-table-wrap">
          <table class="connguard-table">
            <thead>
              <tr>
                <th>${game.i18n.localize('CONNGUARD.Panel.User')}</th>
                <th>${game.i18n.localize('CONNGUARD.Panel.Latency')}</th>
                <th>${game.i18n.localize('CONNGUARD.Panel.Jitter')}</th>
                <th>${game.i18n.localize('CONNGUARD.Panel.Loss')}</th>
                <th>${game.i18n.localize('CONNGUARD.Panel.Status')}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        ${routeOracle}

        <h3>${game.i18n.localize('CONNGUARD.Panel.DropsTitle')}</h3>
        ${drops}

        ${degradation}

        <hr>

        <h3>${game.i18n.localize('CONNGUARD.Panel.JournalTitle')}</h3>
        ${journalInfo}
      </section>
    `

    return foundry.applications.api.DialogV2.wait({
      window: {
        title: `${MODULE_TITLE} — ${game.i18n.localize('CONNGUARD.Panel.WindowTitle')}`,
      },
      content,
      buttons: [
        {
          action: 'openJournalExporter',
          label: game.i18n.localize('CONNGUARD.Panel.ExportJournal'),
          callback: () => this.#openJournalExporter(),
        },
        {
          action: 'close',
          label: game.i18n.localize('CONNGUARD.Panel.Close'),
          default: true,
        },
      ],
      position: { width: 820 },
    })
  }

  #buildRows() {
    const diagnostics = this.#diagnostics
    if (!diagnostics) return ''

    const rows = []
    for (const user of game.users) {
      const data = diagnostics.getUserData(user.id)
      const statusKey = !data
        ? 'CONNGUARD.Panel.StatusUnknown'
        : data.stale
          ? 'CONNGUARD.Panel.StatusNoResponse'
          : 'CONNGUARD.Panel.StatusOk'

      rows.push(`
        <tr>
          <td>
            <strong>${foundry.utils.escapeHTML(user.name)}</strong>
            ${user.isGM ? ` <span class="connguard-pill">${game.i18n.localize('CONNGUARD.Panel.GMSuffix')}</span>` : ''}
          </td>
          <td>${data ? `${data.average}ms` : '—'}</td>
          <td>${data?.jitter ?? '—'}</td>
          <td>${data ? `${data.lossPct}%` : '—'}</td>
          <td>${game.i18n.localize(statusKey)}</td>
        </tr>
      `)
    }

    return rows.join('')
  }

  #buildRouteOracle() {
    const diagnostics = this.#diagnostics
    const reports = diagnostics?.getAllRouteReports?.() ?? new Map()

    if (!reports.size) {
      return `
        <h3>${game.i18n.localize('CONNGUARD.Route.MatrixTitle')}</h3>
        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.Route.MatrixEmpty')}</p>
      `
    }

    const rows = []
    for (const user of game.users) {
      const report = reports.get(user.id)
      const best = diagnostics.getBestRouteForUser(user.id)

      if (!report) {
        rows.push(`
          <tr>
            <td>${foundry.utils.escapeHTML(user.name)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td>${game.i18n.localize('CONNGUARD.Route.NotScanned')}</td>
          </tr>
        `)
        continue
      }

      rows.push(`
        <tr class="${best?.cssClass ?? 'connguard-route-sealed'}">
          <td>${foundry.utils.escapeHTML(user.name)}</td>
          <td>
            ${
              best
                ? `<a href="${escapeHtml(best.url)}" target="_blank" rel="noreferrer">${escapeHtml(best.label)}</a>`
                : '—'
            }
          </td>
          <td>${escapeHtml(best?.type ?? '—')}</td>
          <td>${best?.medianMs ?? '—'}${best?.medianMs ? 'ms' : ''}</td>
          <td>
            ${
              best
                ? `${best.score} · ${game.i18n.localize(best.statusKey)}`
                : game.i18n.localize('CONNGUARD.Route.NoReachable')
            }
          </td>
        </tr>
      `)
    }

    return `
      <h3>${game.i18n.localize('CONNGUARD.Route.MatrixTitle')}</h3>
      <div class="connguard-table-wrap">
        <table class="connguard-table connguard-route-table">
          <thead>
            <tr>
              <th>${game.i18n.localize('CONNGUARD.Panel.User')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Best')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Type')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.Median')}</th>
              <th>${game.i18n.localize('CONNGUARD.Route.StatusLabel')}</th>
            </tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    `
  }

  #buildDrops() {
    const diagnostics = this.#diagnostics
    const drops = diagnostics?.getLocalDrops() ?? []
    if (drops.length === 0) {
      return `<p class="connguard-muted">${game.i18n.localize('CONNGUARD.Panel.NoDrops')}</p>`
    }

    const items = drops
      .slice()
      .reverse()
      .map(drop => {
        const when = new Date(drop.start).toLocaleTimeString()
        const seconds = (drop.durationMs / 1000).toFixed(1)
        return `<li>${when} — ${seconds}s</li>`
      })
      .join('')

    return `<ul class="connguard-drop-list">${items}</ul>`
  }

  #buildDegradation() {
    const diagnostics = this.#diagnostics
    const alerts = diagnostics?.getDegradationAlerts() ?? []
    if (alerts.length === 0) return ''

    const items = alerts
      .slice()
      .reverse()
      .map(alert => {
        const when = new Date(alert.timestamp).toLocaleTimeString()
        const user = game.users.get(alert.userId)?.name ?? alert.userId ?? '?'
        return `<li>${when} — ${foundry.utils.escapeHTML(user)}: ${alert.rtt}ms (${game.i18n.format('CONNGUARD.Panel.Cycles', { count: alert.cycles })})</li>`
      })
      .join('')

    return `
      <h3>${game.i18n.localize('CONNGUARD.Panel.DegradationTitle')}</h3>
      <ul class="connguard-drop-list">${items}</ul>
    `
  }

  #openJournalExporter() {
    const journal = this.#journal
    if (!journal || journal.entryCount === 0) {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.Panel.JournalEmpty'))
      return
    }

    journal.openExporter()
  }
}
