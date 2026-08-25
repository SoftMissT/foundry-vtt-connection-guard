import { MODULE_TITLE, MODULE_ID, PUBLIC_STUN_SERVERS, SETTINGS, JOURNAL_TYPES } from './constants.js'

/**
 * Benchmark de servidores STUN/TURN a partir do navegador do próprio
 * usuário. Mede o tempo até o primeiro candidato ICE "srflx" (reflexivo
 * — revela o IP público visto pelo servidor). Isso é uma proxy razoável
 * de latência/qualidade de rota até aquele servidor.
 *
 * Diferença da v1.0.0 (webrtc-advisor): além de medir, TENTA aplicar
 * automaticamente o melhor servidor na configuração WebRTC do Foundry.
 * Se a API não estiver disponível ou falhar, entrega instrução manual
 * como fallback (Artigo IV da Constitution — honestidade técnica).
 */
export class WebRtcOptimizer {
  static journal = null

  async render() {
    const results = await this.#benchmarkAll()
    const applied = this.#tryAutoApply(results)
    const content = this.#buildContent(results, applied)

    return foundry.applications.api.DialogV2.wait({
      window: { title: `${MODULE_TITLE} — ${game.i18n.localize('CONNGUARD.WebRtc.WindowTitle')}` },
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
      position: { width: 520 },
    })
  }

  /**
   * Tenta aplicar automaticamente o melhor servidor STUN na config WebRTC.
   * @param {Array} results resultados do benchmark (ordenados por tempo)
   * @returns {boolean} true se aplicou, false se fallback manual
   */
  #tryAutoApply(results) {
    const best = results.find(r => r.timeMs !== null)
    if (!best) return false

    try {
      const webrtcSettings = game.webrtc?.settings
      if (webrtcSettings?.set) {
        webrtcSettings.set(MODULE_ID, 'stun.servers', JSON.stringify([{ urls: best.url }]))
        ui.notifications.info(
          game.i18n.format('CONNGUARD.Notif.WebRtcAutoApplied', { url: best.url }),
        )
        WebRtcOptimizer.journal?.log(JOURNAL_TYPES.WEBRTC, {
          url: best.url,
          timeMs: best.timeMs,
          autoApplied: true,
        })
        return true
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | auto-aplicação WebRTC falhou (${err?.message ?? err})`)
    }

    ui.notifications.warn(game.i18n.localize('CONNGUARD.Notif.WebRtcAutoFailed'))
    return false
  }

  async #benchmarkAll() {
    const custom = game.settings.get(MODULE_ID, SETTINGS.CUSTOM_STUN_SERVERS)
    const servers = custom
      ? custom
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : PUBLIC_STUN_SERVERS

    const results = await Promise.all(servers.map(url => this.#benchmarkOne(url)))
    const sorted = results.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity))

    for (const r of sorted) {
      WebRtcOptimizer.journal?.log(JOURNAL_TYPES.WEBRTC, r)
    }

    return sorted
  }

  #benchmarkOne(url, timeoutMs = 2500) {
    return new Promise(resolve => {
      const start = performance.now()
      let settled = false
      const pc = new RTCPeerConnection({ iceServers: [{ urls: url }] })

      const finish = timeMs => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        pc.onicecandidate = null
        try {
          pc.close()
        } catch (_err) {
          /* já fechado, ignora */
        }
        resolve({ url, timeMs })
      }

      const timer = setTimeout(() => finish(null), timeoutMs)

      pc.onicecandidate = event => {
        const candidate = event.candidate?.candidate ?? ''
        if (candidate.includes('typ srflx')) {
          finish(Math.round(performance.now() - start))
        }
      }

      pc.createDataChannel('connection-guard-probe')
      pc
        .createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(() => finish(null))
    })
  }

  #buildContent(results, autoApplied) {
    const rows = results
      .map(r => {
        const status = r.timeMs === null
          ? game.i18n.localize('CONNGUARD.WebRtc.NoResponse')
          : `${r.timeMs}ms`
        return `<tr><td><code>${r.url}</code></td><td>${status}</td></tr>`
      })
      .join('')

    const appliedMsg = autoApplied
      ? `<p class="connguard-muted">✅ ${game.i18n.localize('CONNGUARD.WebRtc.AutoApplied')}</p>`
      : ''

    return `
      <section class="connguard-panel">
        <p>${game.i18n.localize('CONNGUARD.WebRtc.Explanation')}</p>
        <table class="connguard-table">
          <thead>
            <tr>
              <th>${game.i18n.localize('CONNGUARD.WebRtc.Server')}</th>
              <th>${game.i18n.localize('CONNGUARD.WebRtc.Time')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${appliedMsg}
        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.WebRtc.HowTo')}</p>
        <p class="connguard-muted">${game.i18n.localize('CONNGUARD.WebRtc.TurnNote')}</p>
      </section>
    `
  }

  async #copyBest(results) {
    const best = results.find(r => r.timeMs !== null)
    if (!best) {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.WebRtc.NoneAvailable'))
      return
    }
    try {
      await navigator.clipboard.writeText(best.url)
      ui.notifications.info(game.i18n.format('CONNGUARD.WebRtc.Copied', { url: best.url }))
    } catch (_err) {
      ui.notifications.warn(game.i18n.localize('CONNGUARD.WebRtc.CopyFailed'))
    }
  }
}
