import { MODULE_TITLE } from './constants.js'

/**
 * Janela somente-leitura para o GM: latência, jitter e perda estimada de
 * cada usuário conectado, mais o histórico de quedas do cliente local.
 * Implementado como DialogV2 (ApplicationV2) — não precisa de template
 * Handlebars separado porque o conteúdo é só uma tabela simples.
 */
export class GmPanel {
  static diagnostics = null // injetado pelo main.js antes do primeiro uso

  async render(_force) {
    const rows = this.#buildRows()
    const drops = this.#buildDrops()

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
      </section>
    `

    return foundry.applications.api.DialogV2.wait({
      window: { title: `${MODULE_TITLE} — ${game.i18n.localize('CONNGUARD.Panel.WindowTitle')}` },
      content,
      buttons: [
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
          <td>${foundry.utils.escapeHTML(user.name)}${user.isGM ? ' (GM)' : ''}</td>
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
}
