import {
  MODULE_TITLE,
  MODULE_ID,
  PUBLIC_STUN_SERVERS,
  SETTINGS,
  JOURNAL_TYPES,
} from './constants.js'

/**
 * Benchmark de servidores STUN/TURN a partir do navegador do próprio usuário.
 *
 * Este módulo mede o tempo até o primeiro candidato ICE "srflx" usando
 * RTCPeerConnection. Isso é uma proxy prática para comparar servidores STUN.
 *
 * Nota técnica:
 * - Não mexe em VPN, DNS, firewall ou rota real do sistema.
 * - Não tenta mais escrever diretamente em game.webrtc.settings, porque essa
 *   API variou/quebrou no runtime testado.
 * - Fluxo seguro: medir → recomendar → copiar o melhor servidor.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export class WebRtcOptimizer {
  #journal

  constructor(journal) {
    this.#journal = journal
  }

  async render(_force) {
    const results = await this.#benchmarkAll()
    const best = this.#bestResult(results)
    const content = this.#buildContent(results, best)

    if (best) {
      this.#journal?.log(JOURNAL_TYPES.WEBRTC, {
        url: best.url,
        timeMs: best.timeMs,
        recommended: true,
        autoApplied: false,
      })
    }

    return foundry.applications.api.DialogV2.wait({
      window: {
        title: `${MODULE_TITLE} ${game.i18n.localize('CONNGUARD.WebRtc.WindowTitle')}`,
      },
      content,
      buttons: [
        {
          action: 'copy',
          label: game.i18n.localize('CONNGUARD.WebRtc.CopyBest'),
          callback: () => this.#copyBest(results),
        },
        {
          action: 'close',
          label: game.i18n.localize('CONNGUARD.Panel.Close'),
          default: true,
        },
      ],
      position: { width: 680 },
    })
  }

  async #benchmarkAll() {
    const servers = this.#configuredServers()
    const results = await Promise.all(servers.map(url => this.#benchmarkOne(url)))

    const sorted = results.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity))

    for (const result of sorted) {
      this.#journal?.log(JOURNAL_TYPES.WEBRTC, {
        ...result,
        autoApplied: false,
      })
    }

    return sorted
  }

  #configuredServers() {
    const custom = String(game.settings.get(MODULE_ID, SETTINGS.CUSTOM_STUN_SERVERS) ?? '').trim()

    if (!custom) return PUBLIC_STUN_SERVERS

    const parsed = custom
      .split(',')
      .map(server => server.trim())
      .filter(server => /^(stun|turn):.+$/i.test(server))

    return parsed.length ? parsed : PUBLIC_STUN_SERVERS
  }

  #benchmarkOne(url, timeoutMs = 2500) {
    return new Promise(resolve => {
      const start = performance.now()
      let settled = false
      let timer = null
      let pc = null

      const finish = timeMs => {
        if (settled) return
        settled = true

        if (timer) clearTimeout(timer)

        if (pc) {
          pc.onicecandidate = null
          pc.onicecandidateerror = null
          try {
            pc.close()
          } catch {
            /* já fechado, ignora */
          }
        }

        resolve({ url, timeMs })
      }

      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: url }] })

        timer = setTimeout(() => finish(null), timeoutMs)

        pc.onicecandidate = event => {
          const candidate = event.candidate?.candidate ?? ''
          if (candidate.includes('typ srflx')) {
            finish(Math.round(performance.now() - start))
          }
        }

        pc.onicecandidateerror = event => {
          console.warn(
            `${MODULE_ID} | ICE candidate error em ${url}: ${event?.errorText ?? event?.errorCode ?? 'erro desconhecido'}`,
          )
        }

        pc.createDataChannel('connection-guard-probe')

        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(err => {
            console.warn(`${MODULE_ID} | STUN benchmark offer failed: ${err?.message ?? err}`)
            finish(null)
          })
      } catch (err) {
        console.warn(`${MODULE_ID} | STUN benchmark failed: ${err?.message ?? err}`)
        finish(null)
      }
    })
  }

  #bestResult(results) {
    return results.find(result => result.timeMs !== null) ?? null
  }

  #buildContent(results, best) {
    const rows = results
      .map(result => {
        const status =
          result.timeMs === null
            ? game.i18n.localize('CONNGUARD.WebRtc.NoResponse')
            : `${result.timeMs}ms`

        const bestMark = best?.url === result.url ? ' ★' : ''

        return `
          <tr>
            <td><code>${escapeHtml(result.url)}${bestMark}</code></td>
            <td>${escapeHtml(status)}</td>
          </tr>
        `
      })
      .join('')

    const bestBlock = best
      ? `
        <div class="connguard-route-best connguard-route-stable">
          <div>
            <strong>${game.i18n.localize('CONNGUARD.Route.Best')}</strong>
            <span><code>${escapeHtml(best.url)}</code></span>
          </div>
          <div class="connguard-route-best-meta">
            <span>${best.timeMs}ms</span>
          </div>
        </div>
      `
      : `<p class="connguard-route-sealed">${game.i18n.localize('CONNGUARD.WebRtc.NoneAvailable')}</p>`

    return `
      <section class="connguard-panel connguard-abyss connguard-webrtc-panel">
        <h2>${game.i18n.localize('CONNGUARD.WebRtc.WindowTitle')}</h2>

        <p>${game.i18n.localize('CONNGUARD.WebRtc.Explanation')}</p>

        ${bestBlock}

        <div class="connguard-table-wrap">
          <table class="connguard-table">
            <thead>
              <tr>
                <th>${game.i18n.localize('CONNGUARD.WebRtc.Server')}</th>
                <th>${game.i18n.localize('CONNGUARD.WebRtc.Time')}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.WebRtc.HowTo')}</p>
        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.WebRtc.TurnNote')}</p>
      </section>
    `
  }

  async #copyBest(results) {
    const best = this.#bestResult(results)

    if (!best) {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.WebRtc.NoneAvailable'))
      return
    }

    try {
      await navigator.clipboard.writeText(best.url)
      ui.notifications.info(game.i18n.format('CONNGUARD.WebRtc.Copied', { url: best.url }))
    } catch {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.WebRtc.CopyFailed'))
    }
  }
}
