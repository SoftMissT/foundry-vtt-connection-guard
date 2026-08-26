import { MODULE_TITLE, JOURNAL_TYPES } from './constants.js'

/**
 * Captura eventos de runtime do módulo (lifecycle, latência, quedas,
 * reconexões, degradação, WebRTC, erros) em memória e compila um journal
 * em markdown que pode ser exportado como Journal Entry do Foundry — útil
 * para testar e diagnosticar se o módulo está funcionando corretamente.
 */
export class JournalLogger {
  #entries = []
  #journalEntryId = null
  static MAX_ENTRIES = 500

  /**
   * Registra um evento no journal.
   * @param {string} type tipo do evento (ver JOURNAL_TYPES em constants.js)
   * @param {object} data dados específicos do evento
   */
  log(type, data = {}) {
    this.#entries.push({
      timestamp: Date.now(),
      type,
      ...data,
    })
    if (this.#entries.length > JournalLogger.MAX_ENTRIES) {
      this.#entries.shift()
    }
  }

  /** Número de entradas registradas. */
  get entryCount() {
    return this.#entries.length
  }

  /** Limpa todas as entradas e esquece a Journal Entry associada. */
  clear() {
    this.#entries = []
    this.#journalEntryId = null
  }

  /**
   * Gera o journal completo em formato markdown.
   * @returns {string} documento markdown
   */
  generateMarkdown() {
    const now = new Date()
    const lines = []
    const i18n = key => game.i18n.localize(key)

    lines.push(`# ${MODULE_TITLE} — Journal`)
    lines.push('')
    lines.push(`**${i18n('CONNGUARD.Journal.Generated')}:** ${now.toLocaleString()}`)
    lines.push(`**${i18n('CONNGUARD.Journal.Session')}:** ${now.toISOString().slice(0, 10)}`)
    lines.push(`**${i18n('CONNGUARD.Journal.Entries')}:** ${this.#entries.length}`)
    lines.push('')

    const grouped = this.#groupByType()

    if (grouped[JOURNAL_TYPES.LIFECYCLE]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionLifecycle')}`)
      lines.push('')
      for (const e of grouped[JOURNAL_TYPES.LIFECYCLE]) {
        lines.push(`- [${this.#fmtTime(e.timestamp)}] ${e.message}`)
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.LATENCY]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionLatency')}`)
      lines.push('')
      lines.push(`| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.User')} | ${i18n('CONNGUARD.Journal.Rtt')} | ${i18n('CONNGUARD.Journal.Jitter')} | ${i18n('CONNGUARD.Journal.Loss')} |`)
      lines.push('|------|---------|----------|-------------|-----------|')
      for (const e of grouped[JOURNAL_TYPES.LATENCY]) {
        const user = e.userName ?? e.userId ?? '?'
        lines.push(
          `| ${this.#fmtTime(e.timestamp)} | ${user} | ${e.average ?? '—'} | ${e.jitter ?? '—'} | ${e.lossPct ?? 0} |`,
        )
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.CONNECTION]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionConnection')}`)
      lines.push('')
      lines.push(`| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.Event')} | ${i18n('CONNGUARD.Journal.Details')} |`)
      lines.push('|------|--------|----------|')
      for (const e of grouped[JOURNAL_TYPES.CONNECTION]) {
        lines.push(`| ${this.#fmtTime(e.timestamp)} | ${e.event} | ${e.details ?? ''} |`)
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.DEGRADATION]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionDegradation')}`)
      lines.push('')
      lines.push(`| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.User')} | ${i18n('CONNGUARD.Journal.Rtt')} | ${i18n('CONNGUARD.Journal.Cycles')} |`)
      lines.push('|------|---------|----------|--------|')
      for (const e of grouped[JOURNAL_TYPES.DEGRADATION]) {
        const user = e.userName ?? e.userId ?? '?'
        lines.push(`| ${this.#fmtTime(e.timestamp)} | ${user} | ${e.rtt ?? '—'} | ${e.cycles ?? '—'} |`)
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.STALE]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionStale')}`)
      lines.push('')
      lines.push(`| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.User')} | ${i18n('CONNGUARD.Journal.LastSeen')} |`)
      lines.push('|------|---------|----------------|')
      for (const e of grouped[JOURNAL_TYPES.STALE]) {
        const user = e.userName ?? e.userId ?? '?'
        lines.push(`| ${this.#fmtTime(e.timestamp)} | ${user} | ${this.#fmtTime(e.lastSeen)} |`)
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.WEBRTC]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionWebrtc')}`)
      lines.push('')
      lines.push(`| ${i18n('CONNGUARD.Journal.Server')} | ${i18n('CONNGUARD.Journal.Time')} |`)
      lines.push('|----------|------------|')
      for (const e of grouped[JOURNAL_TYPES.WEBRTC]) {
        lines.push(`| ${e.url} | ${e.timeMs ?? i18n('CONNGUARD.Journal.NoResponse')} |`)
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.ERROR]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionErrors')}`)
      lines.push('')
      for (const e of grouped[JOURNAL_TYPES.ERROR]) {
        lines.push(`- [${this.#fmtTime(e.timestamp)}] ${e.message}`)
      }
      lines.push('')
    }

    if (this.#entries.length === 0) {
      lines.push(i18n('CONNGUARD.Journal.NoEntries'))
    }

    return lines.join('\n')
  }

  /**
   * Cria ou atualiza uma Journal Entry no Foundry com o conteúdo
   * do journal convertido para HTML.
   * @returns {Promise<JournalEntry|null>} a entrada criada/atualizada
   */
  async exportToJournalEntry() {
    const markdown = this.generateMarkdown()
    const html = this.#markdownToHtml(markdown)
    const dateStr = new Date().toISOString().slice(0, 10)
    const name = `${MODULE_TITLE} — Journal ${dateStr}`

    if (this.#journalEntryId) {
      const existing = game.journal.get(this.#journalEntryId)
      if (existing) {
        const page = existing.pages.contents[0]
        if (page) {
          await page.update({ text: { content: html, format: 1 } })
        } else {
          await existing.createEmbeddedDocuments('JournalEntryPage', [
            { name: 'Journal', type: 'text', text: { content: html, format: 1 } },
          ])
        }
        return existing
      }
    }

    const result = await JournalEntry.create({ name })
    const entry = Array.isArray(result) ? result[0] : result
    if (!entry) return null

    await entry.createEmbeddedDocuments('JournalEntryPage', [
      { name: 'Journal', type: 'text', text: { content: html, format: 1 } },
    ])

    this.#journalEntryId = entry.id
    return entry
  }

  #groupByType() {
    const groups = {}
    for (const e of this.#entries) {
      if (!groups[e.type]) groups[e.type] = []
      groups[e.type].push(e)
    }
    return groups
  }

  #fmtTime(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString()
  }

  #inline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  }

  #markdownToHtml(md) {
    const lines = md.split('\n')
    const html = []
    let inTable = false
    let inList = false
    let skipNextTableRow = false

    const closeList = () => {
      if (inList) {
        html.push('</ul>')
        inList = false
      }
    }
    const closeTable = () => {
      if (inTable) {
        html.push('</tbody></table>')
        inTable = false
      }
    }

    for (const line of lines) {
      if (line.startsWith('### ')) {
        closeList()
        closeTable()
        html.push(`<h3>${this.#inline(line.slice(4))}</h3>`)
      } else if (line.startsWith('## ')) {
        closeList()
        closeTable()
        html.push(`<h2>${this.#inline(line.slice(3))}</h2>`)
      } else if (line.startsWith('# ')) {
        closeList()
        closeTable()
        html.push(`<h1>${this.#inline(line.slice(2))}</h1>`)
      } else if (line.startsWith('|') && line.trim().endsWith('|')) {
        closeList()
        const cells = line.split('|').slice(1, -1).map(c => c.trim())

        if (!inTable) {
          html.push('<table class="connguard-journal-table">')
          html.push('<thead><tr>')
          for (const c of cells) html.push(`<th>${this.#inline(c)}</th>`)
          html.push('</tr></thead><tbody>')
          inTable = true
          skipNextTableRow = true
        } else if (skipNextTableRow) {
          skipNextTableRow = false
        } else {
          html.push('<tr>')
          for (const c of cells) html.push(`<td>${this.#inline(c)}</td>`)
          html.push('</tr>')
        }
      } else if (line.startsWith('- ')) {
        closeTable()
        if (!inList) {
          html.push('<ul>')
          inList = true
        }
        html.push(`<li>${this.#inline(line.slice(2))}</li>`)
      } else if (line === '---') {
        closeList()
        closeTable()
        html.push('<hr>')
      } else if (line.trim() === '') {
        closeList()
        closeTable()
      } else if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
        closeList()
        closeTable()
        html.push(`<p><em>${this.#inline(line.slice(1, -1))}</em></p>`)
      } else {
        closeList()
        closeTable()
        html.push(`<p>${this.#inline(line)}</p>`)
      }
    }

    closeList()
    closeTable()

    return `<div class="connection-guard-journal">${html.join('\n')}</div>`
  }
}
