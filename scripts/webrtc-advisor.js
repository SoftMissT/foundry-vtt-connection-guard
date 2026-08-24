import { MODULE_TITLE, PUBLIC_STUN_SERVERS } from './constants.js'

/**
 * Mede, a partir do navegador do próprio usuário, quanto tempo cada
 * servidor STUN público leva para devolver o primeiro candidato ICE
 * "srflx" (reflexivo — revela o IP público visto pelo servidor). Isso é
 * uma proxy razoável de latência/qualidade de rota até aquele servidor.
 *
 * Importante — honestidade técnica: isto NÃO troca a configuração de
 * Áudio/Vídeo do Foundry sozinho, porque a Foundry não expõe uma API de
 * módulo documentada e estável para isso. O assistente mostra o ranking
 * e o usuário cola o resultado em Configurar Jogo > Áudio/Vídeo >
 * aba Servidor. Servidores TURN públicos e gratuitos praticamente não
 * existem (TURN consome banda de quem hospeda); para TURN, o caminho
 * real é hospedar um coturn próprio ou contratar um serviço.
 */
export class WebRtcAdvisor {
  async render() {
    const results = await this.#benchmarkAll()
    const content = this.#buildContent(results)

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

  async #benchmarkAll() {
    const results = await Promise.all(PUBLIC_STUN_SERVERS.map(url => this.#benchmarkOne(url)))
    return results.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity))
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

  #buildContent(results) {
    const rows = results
      .map(r => {
        const status = r.timeMs === null
          ? game.i18n.localize('CONNGUARD.WebRtc.NoResponse')
          : `${r.timeMs}ms`
        return `<tr><td><code>${r.url}</code></td><td>${status}</td></tr>`
      })
      .join('')

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
