import { MODULE_TITLE } from './constants.js'

/**
 * Janela somente-leitura para o GM: latência, jitter e perda estimada de
 * cada usuário conectado, histórico de quedas, alertas de degradação,
 * e journal de sessão exportável como Journal Entry.
 * Implementado como DialogV2 (ApplicationV2).
 */
export class GmPanel {
  static diagnostics = null
  static journal = null

  async render(_force) {
    const rows = this.#buildRows()
    const drops = this.#buildDrops()
    const degradation = this.#buildDegradation()
    const journalInfo = GmPanel.journal
      ? `<p class="connguard-muted">${game.i18n.format('CONNGUARD.Panel.JournalEntries', { count: GmPanel.journal.entryCount })}</p>`
      : ''

    const content = `
      <section class="connguard-panel">
        <h3>${game.i18n.localize('CONNGUARD.Panel.UsersTitle')}</h3>
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
        <h3>${game.i18n.localize('CONNGUARD.Panel.DropsTitle')}</h3>
        ${drops}
        ${degradation}
        <hr>
        <h3>${game.i18n.localize('CONNGUARD.Panel.JournalTitle')}</h3>
        ${journalInfo}
      </section>
    `

    return foundry.applications.api.DialogV2.wait({
      window: { title: `${MODULE_TITLE} — ${game.i18n.localize('CONNGUARD.Panel.WindowTitle')}` },
      content,
      buttons: [
        {
          action: 'exportJournal',
          label: game.i18n.localize('CONNGUARD.Panel.ExportJournal'),
          callback: () => this.#exportJournal(),
        },
        {
          action: 'close',
          label: game.i18n.localize('CONNGUARD.Panel.Close'),
          default: true,
        },
      ],
      position: { width: 520 },
    })
  }

  #buildRows() {
    const diagnostics = GmPanel.diagnostics
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
          <td>${foundry.utils.escapeHTML(user.name)}${user.isGM ? ` ${game.i18n.localize('CONNGUARD.Panel.GMSuffix')}` : ''}</td>
          <td>${data ? `${data.average}ms` : '—'}</td>
          <td>${data?.jitter ?? '—'}</td>
          <td>${data ? `${data.lossPct}%` : '—'}</td>
          <td>${game.i18n.localize(statusKey)}</td>
        </tr>
      `)
    }
    return rows.join('')
  }

  #buildDrops() {
    const diagnostics = GmPanel.diagnostics
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
    const diagnostics = GmPanel.diagnostics
    const alerts = diagnostics?.getDegradationAlerts() ?? []
    if (alerts.length === 0) return ''

    const items = alerts
      .slice()
      .reverse()
      .map(a => {
        const when = new Date(a.timestamp).toLocaleTimeString()
        const user = game.users.get(a.userId)?.name ?? a.userId ?? '?'
        return `<li>${when} — ${user}: ${a.rtt}ms (${a.cycles} ciclos)</li>`
      })
      .join('')

    return `
      <h3>${game.i18n.localize('CONNGUARD.Panel.DegradationTitle')}</h3>
      <ul class="connguard-drop-list">${items}</ul>
    `
  }

  async #exportJournal() {
    const journal = GmPanel.journal
    if (!journal || journal.entryCount === 0) {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.Panel.JournalEmpty'))
      return
    }
    try {
      const entry = await journal.exportToJournalEntry()
      if (entry) {
        ui.notifications.info(game.i18n.format('CONNGUARD.Panel.JournalCreated', { name: entry.name }))
        entry.show()
      }
    } catch (err) {
      console.error(`${MODULE_TITLE} | erro ao exportar journal`, err)
      ui.notifications.error(game.i18n.localize('CONNGUARD.Panel.JournalError'))
    }
  }
}
