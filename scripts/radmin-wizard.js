import { MODULE_ID, SETTINGS, ROUTE_TYPES } from './constants.js'
import { normalizeRouteProfile, safeParseRouteProfiles, setActiveRoute } from './route-profiles.js'

const RADMIN_HOST = /^26\.(?:\d{1,3}\.){2}\d{1,3}$/

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function notify(type, key, fallback) {
  globalThis.ui?.notifications?.[type]?.(game.i18n?.localize?.(key) || fallback)
}

/** Open the no-code setup wizard for the free Radmin VPN path. */
export async function openRadminWizard() {
  if (!game.user?.isGM) {
    notify('warn', 'CONNGUARD.Service.GmOnly', 'Somente o Mestre pode configurar a rota.')
    return null
  }

  const rawProfiles = game.settings.get(MODULE_ID, SETTINGS.ROUTE_PROFILES)
  const existing = safeParseRouteProfiles(rawProfiles)
    .find(profile => profile.id === 'radmin-vpn')

  const result = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize('CONNGUARD.RadminWizard.Title') },
    content: `
      <p>${game.i18n.localize('CONNGUARD.RadminWizard.Intro')}</p>
      <p class="notes"><i class="fas fa-shield-halved"></i> ${game.i18n.localize('CONNGUARD.RadminWizard.Security')}</p>
      <div class="form-group">
        <label for="connection-guard-radmin-label">${game.i18n.localize('CONNGUARD.RadminWizard.DisplayName')}</label>
        <input id="connection-guard-radmin-label" name="label" type="text" maxlength="64" value="${escapeHtml(existing?.label || 'Radmin VPN Free')}" />
      </div>
      <div class="form-group">
        <label for="connection-guard-radmin-host">${game.i18n.localize('CONNGUARD.RadminWizard.Host')}</label>
        <input id="connection-guard-radmin-host" name="host" type="text" inputmode="numeric" placeholder="26.123.45.67" value="${escapeHtml(existing ? new URL(existing.url).hostname : '')}" required />
      </div>
      <div class="form-group">
        <label for="connection-guard-radmin-port">${game.i18n.localize('CONNGUARD.RadminWizard.Port')}</label>
        <input id="connection-guard-radmin-port" name="port" type="number" min="1" max="65535" step="1" value="${escapeHtml(existing ? new URL(existing.url).port || '30000' : '30000')}" required />
      </div>
      <p class="notes">${game.i18n.localize('CONNGUARD.RadminWizard.Requirements')}</p>
    `,
    ok: game.i18n.localize('CONNGUARD.RadminWizard.Save'),
  })

  if (!result) return null

  const host = String(result.host || '').trim()
  const port = Number(result.port)
  if (!RADMIN_HOST.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    notify('error', 'CONNGUARD.RadminWizard.Invalid', 'Informe um IP Radmin 26.x.x.x e uma porta válida.')
    return null
  }

  const profile = normalizeRouteProfile({
    id: 'radmin-vpn',
    label: String(result.label || '').trim() || 'Radmin VPN Free',
    type: ROUTE_TYPES.RADMIN,
    url: `http://${host}:${port}`,
    requiresVpn: true,
    priority: 1,
    notes: game.i18n.localize('CONNGUARD.RadminWizard.Note'),
  })

  const profiles = safeParseRouteProfiles(rawProfiles).filter(item => item.id !== 'radmin-vpn')
  profiles.push(profile)
  await game.settings.set(MODULE_ID, SETTINGS.ROUTE_PROFILES, JSON.stringify(profiles, null, 2))
  await setActiveRoute(profile)
  globalThis.ui?.notifications?.info?.(
    game.i18n?.format?.('CONNGUARD.RadminWizard.Saved', { url: profile.url }) ||
      `Rota Radmin salva: ${profile.url}`,
  )
  return profile
}
