import { MODULE_ID, MODULE_TITLE, JOURNAL_TYPES } from './constants.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * Captura eventos de runtime do módulo em memória e permite exportar
 * manualmente como Markdown, JSON ou Journal Entry.
 *
 * Importante:
 * - Não cria Journal Entry automaticamente.
 * - Não exporta no shutdown.
 * - Se o GM escolher salvar em Journal Entry, atualiza a mesma entrada
 *   da sessão em vez de criar uma nova toda vez.
 */
export class JournalLogger {
  #entries = []
  #journalEntryId = null
  static MAX_ENTRIES = 500

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

  get entryCount() {
    return this.#entries.length
  }

  clear() {
    this.#entries = []
    this.#journalEntryId = null
  }

  openExporter() {
    new JournalExportApp(this).render(true)
  }

  toJSON() {
    return {
      module: MODULE_ID,
      title: MODULE_TITLE,
      generatedAt: new Date().toISOString(),
      sessionDate: new Date().toISOString().slice(0, 10),
      entryCount: this.#entries.length,
      entries: this.#entries.map(entry => ({ ...entry })),
    }
  }

  generateJson() {
    return JSON.stringify(this.toJSON(), null, 2)
  }

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
      lines.push(
        `| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.User')} | ${i18n('CONNGUARD.Journal.Rtt')} | ${i18n('CONNGUARD.Journal.Jitter')} | ${i18n('CONNGUARD.Journal.Loss')} |`,
      )
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
      lines.push(
        `| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.Event')} | ${i18n('CONNGUARD.Journal.Details')} |`,
      )
      lines.push('|------|--------|----------|')
      for (const e of grouped[JOURNAL_TYPES.CONNECTION]) {
        lines.push(`| ${this.#fmtTime(e.timestamp)} | ${e.event} | ${e.details ?? ''} |`)
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.DEGRADATION]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionDegradation')}`)
      lines.push('')
      lines.push(
        `| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.User')} | ${i18n('CONNGUARD.Journal.Rtt')} | ${i18n('CONNGUARD.Journal.Cycles')} |`,
      )
      lines.push('|------|---------|----------|--------|')
      for (const e of grouped[JOURNAL_TYPES.DEGRADATION]) {
        const user = e.userName ?? e.userId ?? '?'
        lines.push(
          `| ${this.#fmtTime(e.timestamp)} | ${user} | ${e.rtt ?? '—'} | ${e.cycles ?? '—'} |`,
        )
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.STALE]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionStale')}`)
      lines.push('')
      lines.push(
        `| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.User')} | ${i18n('CONNGUARD.Journal.LastSeen')} |`,
      )
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
      lines.push(
        `| ${i18n('CONNGUARD.Journal.Hour')} | ${i18n('CONNGUARD.Journal.Server')} | ${i18n('CONNGUARD.Journal.Time')} |`,
      )
      lines.push('|------|----------|------------|')
      for (const e of grouped[JOURNAL_TYPES.WEBRTC]) {
        lines.push(
          `| ${this.#fmtTime(e.timestamp)} | ${e.url ?? '—'} | ${
            e.timeMs === null ? i18n('CONNGUARD.Journal.NoResponse') : e.timeMs
          } |`,
        )
      }
      lines.push('')
    }

    if (grouped[JOURNAL_TYPES.ROUTE]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionRoute')}`)
      lines.push('')
      for (const e of grouped[JOURNAL_TYPES.ROUTE]) {
        lines.push(`### ${this.#fmtTime(e.timestamp)} — ${e.userName ?? e.userId ?? '?'}`)
        lines.push('')
        lines.push('| Rota | Tipo | Mediana | Jitter | Perda | Score | Estado |')
        lines.push('|------|------|---------|--------|-------|-------|--------|')
        for (const r of e.results ?? []) {
          const score = Number.isFinite(r.score) ? r.score : '∞'
          const state = r.statusKey ? game.i18n.localize(r.statusKey) : '—'
          lines.push(
            `| ${r.label ?? '—'} | ${r.type ?? '—'} | ${r.medianMs ?? '—'} | ${r.jitterMs ?? '—'} | ${r.lossPct ?? '—'} | ${score} | ${state} |`,
          )
        }
        lines.push('')
      }
    }

    if (grouped[JOURNAL_TYPES.ERROR]?.length) {
      lines.push(`## ${i18n('CONNGUARD.Journal.SectionErrors')}`)
      lines.push('')
      for (const e of grouped[JOURNAL_TYPES.ERROR]) {
        lines.push(
          `- [${this.#fmtTime(e.timestamp)}] ${e.message ?? e.error ?? 'Erro desconhecido'}`,
        )
      }
      lines.push('')
    }

    if (this.#entries.length === 0) {
      lines.push(i18n('CONNGUARD.Journal.NoEntries'))
      lines.push('')
    }

    return lines.join('\n')
  }

  downloadMarkdown() {
    this.#downloadFile(
      `${MODULE_ID}-journal-${safeFileStamp()}.md`,
      'text/markdown;charset=utf-8',
      this.generateMarkdown(),
    )
  }

  downloadJson() {
    this.#downloadFile(
      `${MODULE_ID}-journal-${safeFileStamp()}.json`,
      'application/json;charset=utf-8',
      this.generateJson(),
    )
  }

  async copyMarkdown() {
    const markdown = this.generateMarkdown()

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = markdown
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  }

  /**
   * Salva ou atualiza UMA Journal Entry por sessão.
   * Só roda quando o GM clica explicitamente no exportador.
   */
  async saveToJournalEntry() {
    const markdown = this.generateMarkdown()
    const name = `${MODULE_TITLE} — ${new Date().toISOString().slice(0, 10)}`
    const markdownFormat =
      typeof CONST !== 'undefined' ? CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN : 1

    let entry = this.#journalEntryId ? game.journal.get(this.#journalEntryId) : null
    if (!entry) entry = game.journal.find(j => j.name === name)

    if (!entry) {
      entry = await JournalEntry.create({ name })
      this.#journalEntryId = entry.id
    } else {
      this.#journalEntryId = entry.id
      if (entry.name !== name) await entry.update({ name })
    }

    const pageData = {
      name: 'Runtime Log',
      type: 'text',
      text: {
        format: markdownFormat,
        content: markdown,
      },
    }

    const existing = entry.pages.find(p => p.name === 'Runtime Log')
    if (existing) {
      await existing.update(pageData)
    } else {
      await entry.createEmbeddedDocuments('JournalEntryPage', [pageData])
    }

    entry.sheet?.render(true)
    return entry
  }

  // Alias de compatibilidade: código antigo que chamar exportToJournalEntry
  // ainda funciona, mas agora isso só acontece quando chamado explicitamente.
  async exportToJournalEntry() {
    return this.saveToJournalEntry()
  }

  #groupByType() {
    const grouped = {}
    for (const entry of this.#entries) {
      grouped[entry.type] ??= []
      grouped[entry.type].push(entry)
    }
    return grouped
  }

  #fmtTime(timestamp) {
    if (!timestamp) return game.i18n.localize('CONNGUARD.Journal.NoData')
    return new Date(timestamp).toLocaleTimeString()
  }

  #downloadFile(filename, type, content) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export class JournalExportApp extends foundry.applications.api.ApplicationV2 {
  #journal

  static DEFAULT_OPTIONS = {
    id: 'connection-guard-journal-exporter',
    classes: ['connection-guard', 'connguard-journal-exporter'],
    window: {
      title: 'Connection Guard — Journal Export',
      resizable: true,
    },
    position: {
      width: 820,
      height: 'auto',
    },
  }

  constructor(journal, options = {}) {
    super(options)
    this.#journal = journal
  }

  async _renderHTML(_context, _options) {
    const markdown = this.#journal.generateMarkdown()
    const json = this.#journal.generateJson()

    const root = document.createElement('section')
    root.className = 'connguard-panel connguard-abyss connguard-journal-export'

    root.innerHTML = `
      <h2>${game.i18n.localize('CONNGUARD.Journal.ExportWindowTitle')}</h2>
      <p class="connguard-muted">${game.i18n.format('CONNGUARD.Journal.ExportIntro', {
        count: this.#journal.entryCount,
      })}</p>

      <div class="connguard-export-actions">
        <button type="button" data-action="download-md">
          ${game.i18n.localize('CONNGUARD.Journal.DownloadMarkdown')}
        </button>
        <button type="button" data-action="download-json">
          ${game.i18n.localize('CONNGUARD.Journal.DownloadJson')}
        </button>
        <button type="button" data-action="copy-md">
          ${game.i18n.localize('CONNGUARD.Journal.CopyMarkdown')}
        </button>
        <button type="button" data-action="save-journal">
          ${game.i18n.localize('CONNGUARD.Journal.SaveJournal')}
        </button>
        <button type="button" data-action="close">
          ${game.i18n.localize('CONNGUARD.Panel.Close')}
        </button>
      </div>

      <h3>${game.i18n.localize('CONNGUARD.Journal.MarkdownPreview')}</h3>
      <textarea class="connguard-export-textarea" readonly>${escapeHtml(markdown)}</textarea>

      <h3>${game.i18n.localize('CONNGUARD.Journal.JsonPreview')}</h3>
      <textarea class="connguard-export-textarea" readonly>${escapeHtml(json)}</textarea>
    `

    return root
  }

  _replaceHTML(result, content, _options) {
    content.replaceChildren(result)
    this.#activateListeners(result)
  }

  #activateListeners(root) {
    root.querySelector('[data-action="download-md"]')?.addEventListener('click', () => {
      this.#journal.downloadMarkdown()
      ui.notifications.info(game.i18n.localize('CONNGUARD.Journal.Downloaded'))
    })

    root.querySelector('[data-action="download-json"]')?.addEventListener('click', () => {
      this.#journal.downloadJson()
      ui.notifications.info(game.i18n.localize('CONNGUARD.Journal.Downloaded'))
    })

    root.querySelector('[data-action="copy-md"]')?.addEventListener('click', async () => {
      try {
        await this.#journal.copyMarkdown()
        ui.notifications.info(game.i18n.localize('CONNGUARD.Journal.CopiedMarkdown'))
      } catch (err) {
        console.error(`${MODULE_ID} | falha ao copiar markdown`, err)
        ui.notifications.error(game.i18n.localize('CONNGUARD.Journal.CopyFailed'))
      }
    })

    root.querySelector('[data-action="save-journal"]')?.addEventListener('click', async () => {
      try {
        const entry = await this.#journal.saveToJournalEntry()
        ui.notifications.info(
          game.i18n.format('CONNGUARD.Journal.SavedJournal', { name: entry.name }),
        )
      } catch (err) {
        console.error(`${MODULE_ID} | falha ao salvar Journal Entry`, err)
        ui.notifications.error(game.i18n.localize('CONNGUARD.Panel.JournalError'))
      }
    })

    root.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.close()
    })
  }
}
