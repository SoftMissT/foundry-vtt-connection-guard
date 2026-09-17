import { MODULE_ID, SETTINGS } from './constants.js'

/**
 * Radmin Fallback Readiness — orienta o GM a preparar o fallback Radmin
 * antes de depender dele numa sessão.
 *
 * Regras:
 * - Nenhum IP/nome de computador/jogador hardcoded.
 * - Usa somente a radminUrl configurada, a porta extraída e o ambiente.
 * - O módulo NUNCA executa PowerShell, não altera firewall, não instala
 *   Radmin e não solicita privilégio administrativo — apenas gera o comando
 *   como texto copiável e abre a rota para teste manual.
 *
 * Funções puras aqui são testáveis em Node (sem game/window/document no
 * top-level).
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Interpreta REDUNDANCY_CONFIG preservando o campo `validated`. Nunca lança. */
export function safeParseRedundancy(raw) {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw || '{}')
    } catch {
      value = {}
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {}
  return {
    enabled: value.enabled === true,
    radminUrl: typeof value.radminUrl === 'string' ? value.radminUrl : '',
    validated: value.validated === true,
  }
}

function normalizePort(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? String(n) : null
}

/** Porta da radminUrl configurada (default http 80 / https 443). Nunca lança. */
export function extractRadminPort(radminUrl) {
  try {
    const url = new URL(radminUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.port || (url.protocol === 'https:' ? '443' : '80')
  } catch {
    return null
  }
}

/**
 * Comando PowerShell genérico para liberar a porta do Foundry no firewall do
 * HOST (rede Radmin). Apenas TEXTO — nunca executado pelo módulo.
 * Retorna null se a porta for inválida.
 */
export function buildHostFirewallCommand(port) {
  const p = normalizePort(port)
  if (p === null) return null

  return [
    'New-NetFirewallRule `',
    `  -DisplayName "Foundry VTT - Radmin TCP ${p}" \``,
    '  -Direction Inbound `',
    '  -Action Allow `',
    '  -Protocol TCP `',
    `  -LocalPort ${p} \``,
    '  -Profile Any',
  ].join('\n')
}

/**
 * Seção "Radmin Fallback Readiness" do Service Wizard.
 * Retorna '' quando o fallback está desabilitado (não é apresentado como
 * ativo). `localize` é injetado para permitir teste em Node.
 */
export function renderReadinessHtml(redundancy, localize = key => key) {
  const enabled = redundancy?.enabled === true
  const radminUrl = String(redundancy?.radminUrl ?? '').trim()
  if (!enabled || !radminUrl) return ''

  const port = extractRadminPort(radminUrl)
  const command = buildHostFirewallCommand(port)
  const validated = redundancy?.validated === true

  const statusKey = validated
    ? 'CONNGUARD.ServiceWizard.RadminVerified'
    : 'CONNGUARD.ServiceWizard.RadminNotVerified'

  const checklist = [
    'CONNGUARD.ServiceWizard.ReadinessCheck1',
    'CONNGUARD.ServiceWizard.ReadinessCheck2',
    'CONNGUARD.ServiceWizard.ReadinessCheck3',
    'CONNGUARD.ServiceWizard.ReadinessCheck4',
    'CONNGUARD.ServiceWizard.ReadinessCheck5',
  ]
    .map(key => `<li><input type="checkbox" disabled> ${localize(key)}</li>`)
    .join('')

  return `
    <hr>
    <h3>${localize('CONNGUARD.ServiceWizard.ReadinessTitle')}</h3>
    <p class="notes">${localize('CONNGUARD.ServiceWizard.ReadinessWarning')}</p>
    <div class="form-group">
      <label>${localize('CONNGUARD.ServiceWizard.Host')}</label>
      <div>${escapeHtml(radminUrl)}</div>
    </div>
    <div class="form-group">
      <label>${localize('CONNGUARD.ServiceWizard.Port')}</label>
      <div>${escapeHtml(port || '—')}</div>
    </div>
    <div class="connguard-readiness-status ${validated ? '' : 'connguard-warn'}">${localize(statusKey)}</div>
    <ul class="connguard-readiness-checklist">${checklist}</ul>
    <div class="connguard-readiness-actions">
      <button type="button" data-cg-copy-firewall data-cg-port="${escapeHtml(port || '')}">
        ${localize('CONNGUARD.ServiceWizard.CopyFirewallCommand')}
      </button>
      <a href="${escapeHtml(radminUrl)}" target="_blank" rel="noreferrer">
        ${localize('CONNGUARD.ServiceWizard.OpenRadminTest')}
      </a>
      <button type="button" data-cg-mark-verified>
        ${localize('CONNGUARD.ServiceWizard.MarkVerified')}
      </button>
    </div>
    ${command ? `<pre class="connguard-readiness-command">${escapeHtml(command)}</pre>` : ''}
  `
}

/** Copia texto para a área de transferência (clipboard ou fallback). */
export async function copyText(text) {
  try {
    if (globalThis.navigator?.clipboard?.writeText) {
      await globalThis.navigator.clipboard.writeText(text)
      return { ok: true }
    }
  } catch {
    // tenta fallback abaixo
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const done = document.execCommand('copy')
    textarea.remove()
    return done ? { ok: true } : { ok: false, error: 'execCommand-copy-failed' }
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) }
  }
}

let listenersReady = false

/**
 * Registra uma vez os handlers delegados dos botões de readiness
 * (COPY FIREWALL COMMAND e MARK AS VERIFIED). Não executa PowerShell;
 * apenas copia texto e persiste o flag de validação.
 */
export function ensureReadinessListeners() {
  if (listenersReady) return
  listenersReady = true

  document.addEventListener('click', async event => {
    const copyButton = event.target.closest('[data-cg-copy-firewall]')
    if (copyButton) {
      const command = buildHostFirewallCommand(copyButton.dataset.cgPort)
      if (!command) return
      const result = await copyText(command)
      if (result.ok) {
        ui.notifications?.info?.(
          game.i18n.localize('CONNGUARD.ServiceWizard.CopiedFirewallCommand'),
        )
      } else {
        ui.notifications?.error?.(game.i18n.localize('CONNGUARD.ServiceWizard.CopyFailed'))
      }
      return
    }

    if (event.target.closest('[data-cg-mark-verified]')) {
      await markFallbackVerified()
    }
  })
}

async function markFallbackVerified() {
  if (!game.user?.isGM) {
    ui.notifications?.warn?.(game.i18n.localize('CONNGUARD.Service.GmOnly'))
    return
  }

  const current = safeParseRedundancy(game.settings.get(MODULE_ID, SETTINGS.REDUNDANCY_CONFIG))
  if (!current.enabled || !current.radminUrl) {
    ui.notifications?.warn?.(game.i18n.localize('CONNGUARD.ServiceWizard.InvalidRadmin'))
    return
  }

  try {
    current.validated = true
    await game.settings.set(MODULE_ID, SETTINGS.REDUNDANCY_CONFIG, JSON.stringify(current))
    ui.notifications?.info?.(game.i18n.localize('CONNGUARD.ServiceWizard.VerifiedNotif'))
  } catch (err) {
    ui.notifications?.error?.(String(err?.message ?? err))
  }
}
