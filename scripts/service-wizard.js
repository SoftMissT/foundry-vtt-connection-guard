import {
  MODULE_ID,
  SETTINGS,
  ROUTE_TYPES,
  SERVICE_CATALOG,
  REDUNDANCY_PRIMARY_TYPES,
} from './constants.js'
import {
  getActiveRoute,
  normalizeRouteProfile,
  safeParseRouteProfiles,
  setActiveRoute,
} from './route-profiles.js'
import {
  renderReadinessHtml,
  ensureReadinessListeners,
  safeParseRedundancy,
} from './radmin-readiness.js'

function isValidRadminHost(host) {
  const parts = String(host).split('.')
  if (parts.length !== 4) return false

  const octets = parts.map(Number)
  return (
    octets.every(
      (value, index) =>
        Number.isInteger(value) && value >= 0 && value <= 255 && String(value) === parts[index],
    ) && octets[0] === 26
  )
}

function safeUrl(value) {
  try {
    return value ? new URL(value) : null
  } catch {
    return null
  }
}

const SERVICES = [
  { type: ROUTE_TYPES.RADMIN, id: 'radmin-vpn', labelKey: 'CONNGUARD.Service.Name.radmin' },
  { type: ROUTE_TYPES.PLAYIT, id: 'playit', labelKey: 'CONNGUARD.Service.Name.playit' },
  { type: ROUTE_TYPES.NGROK, id: 'ngrok', labelKey: 'CONNGUARD.Service.Name.ngrok' },
  { type: ROUTE_TYPES.CLOUDFLARE, id: 'cloudflare', labelKey: 'CONNGUARD.Service.Name.cloudflare' },
  { type: ROUTE_TYPES.LOCAL, id: 'local', labelKey: 'CONNGUARD.Service.Name.local' },
  { type: ROUTE_TYPES.DIRECT, id: 'direct', labelKey: 'CONNGUARD.Service.Name.direct' },
  { type: ROUTE_TYPES.CUSTOM, id: 'custom', labelKey: 'CONNGUARD.Service.Name.custom' },
]

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

function existingFor(type, profiles) {
  return profiles.find(profile => profile.type === type) || null
}

/** GM-only, no-code route setup. The selected service is the only route saved and activated. */
export async function openServiceWizard() {
  if (!game.user?.isGM) {
    notify('warn', 'CONNGUARD.Service.GmOnly', 'Somente o Mestre pode configurar a rota.')
    return null
  }

  ensureReadinessListeners()

  const rawProfiles = game.settings.get(MODULE_ID, SETTINGS.ROUTE_PROFILES)
  const profiles = safeParseRouteProfiles(rawProfiles)
  const defaultService = getActiveService(profiles)
  const serviceChoice = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize('CONNGUARD.ServiceWizard.Title') },
    content: renderServiceChoice(defaultService),
    ok: game.i18n.localize('CONNGUARD.ServiceWizard.Continue'),
  })

  if (!serviceChoice) return null

  const service = SERVICES.find(item => item.type === serviceChoice.service)
  if (!service) {
    notify('error', 'CONNGUARD.ServiceWizard.Invalid', 'Escolha um serviço válido.')
    return null
  }

  const rawRedundancy = game.settings.get(MODULE_ID, SETTINGS.REDUNDANCY_CONFIG)
  const redundancy = safeParseRedundancy(rawRedundancy)

  const result = await foundry.applications.api.DialogV2.input({
    window: { title: game.i18n.localize('CONNGUARD.ServiceWizard.DetailsTitle') },
    content: renderContent(service.type, profiles, redundancy),
    ok: game.i18n.localize('CONNGUARD.ServiceWizard.Save'),
  })
  if (!result) return null

  const label = String(result.label || '').trim() || game.i18n.localize(service.labelKey)
  const profile = buildProfile(service, label, result)
  if (!profile) {
    notify('error', 'CONNGUARD.ServiceWizard.Invalid', 'Confira o endereço e a porta informados.')
    return null
  }

  let nextRedundancy = { enabled: false, radminUrl: '', validated: false }
  if (REDUNDANCY_PRIMARY_TYPES.includes(service.type) && result.redundancyEnable) {
    const rHost = String(result.redundancyHost || '').trim()
    const rPort = Number(result.redundancyPort)
    if (isValidRadminHost(rHost) && Number.isInteger(rPort) && rPort >= 1 && rPort <= 65535) {
      const nextRadminUrl = `http://${rHost}:${rPort}`
      const keepValidated =
        redundancy.enabled && redundancy.radminUrl === nextRadminUrl && redundancy.validated
      nextRedundancy = {
        enabled: true,
        radminUrl: nextRadminUrl,
        validated: keepValidated === true,
      }
    } else {
      notify(
        'error',
        'CONNGUARD.ServiceWizard.InvalidRadmin',
        'IP/Porta do Radmin inválidos. O fallback não foi ativado.',
      )
      return null
    }
  }

  const nextProfiles = profiles.filter(item => item.id !== service.id)
  nextProfiles.push(profile)
  await game.settings.set(MODULE_ID, SETTINGS.ROUTE_PROFILES, JSON.stringify(nextProfiles, null, 2))
  await setActiveRoute(profile)
  await game.settings.set(MODULE_ID, SETTINGS.REDUNDANCY_CONFIG, JSON.stringify(nextRedundancy))

  globalThis.ui?.notifications?.info?.(
    game.i18n?.format?.('CONNGUARD.ServiceWizard.Saved', { service: profile.label }) ||
      `Serviço ativo: ${profile.label}`,
  )
  return profile
}

function getActiveService(profiles) {
  const active = getActiveRoute() || profiles[0]
  return active?.type || ROUTE_TYPES.RADMIN
}

function renderContent(selectedType, profiles, redundancy) {
  const selected = existingFor(selectedType, profiles)
  const isRadmin = selectedType === ROUTE_TYPES.RADMIN
  const isPrimary = REDUNDANCY_PRIMARY_TYPES.includes(selectedType)
  const endpoint = safeUrl(selected?.url)
  const radminEndpoint = safeUrl(redundancy.radminUrl)

  return `
    <p>${game.i18n.localize('CONNGUARD.ServiceWizard.Intro')}</p>
    <p class="notes"><i class="fas fa-circle-info"></i> ${game.i18n.localize('CONNGUARD.ServiceWizard.NoWebRtc')}</p>
    <div class="form-group">
      <label for="connection-guard-service-label">${game.i18n.localize('CONNGUARD.ServiceWizard.DisplayName')}</label>
      <input id="connection-guard-service-label" name="label" type="text" maxlength="64" value="${escapeHtml(selected?.label || '')}" />
    </div>
    ${
      isRadmin
        ? `
      <div class="form-group">
        <label for="connection-guard-service-host">${game.i18n.localize('CONNGUARD.ServiceWizard.Host')}</label>
        <input id="connection-guard-service-host" name="host" type="text" inputmode="numeric" placeholder="26.123.45.67" value="${escapeHtml(endpoint?.hostname || '')}" required />
      </div>
      <div class="form-group">
        <label for="connection-guard-service-port">${game.i18n.localize('CONNGUARD.ServiceWizard.Port')}</label>
        <input id="connection-guard-service-port" name="port" type="number" min="1" max="65535" step="1" value="${escapeHtml(endpoint?.port || '30000')}" required />
      </div>
    `
        : `
      <div class="form-group">
        <label for="connection-guard-service-endpoint">${game.i18n.localize('CONNGUARD.ServiceWizard.Endpoint')}</label>
        <input id="connection-guard-service-endpoint" name="endpoint" type="text" placeholder="https://exemplo.tunel.gg:30000" value="${escapeHtml(selected?.url || '')}" required />
      </div>
    `
    }
    <p class="notes">${game.i18n.localize(`CONNGUARD.ServiceWizard.Requirements.${selectedType}`)}</p>
    ${
      isPrimary
        ? `
      <hr>
      <h3>${game.i18n.localize('CONNGUARD.ServiceWizard.RedundancyTitle')}</h3>
      <p class="notes">${game.i18n.localize('CONNGUARD.ServiceWizard.RedundancyHint')}</p>
      <div class="form-group">
        <label for="connection-guard-redundancy-enable">${game.i18n.localize('CONNGUARD.ServiceWizard.RedundancyEnable')}</label>
        <input id="connection-guard-redundancy-enable" name="redundancyEnable" type="checkbox" ${redundancy.enabled ? 'checked' : ''} />
      </div>
      <div class="form-group">
        <label for="connection-guard-redundancy-host">${game.i18n.localize('CONNGUARD.ServiceWizard.RadminHost')}</label>
        <input id="connection-guard-redundancy-host" name="redundancyHost" type="text" inputmode="numeric" placeholder="26.123.45.67" value="${escapeHtml(radminEndpoint?.hostname || '')}" />
      </div>
      <div class="form-group">
        <label for="connection-guard-redundancy-port">${game.i18n.localize('CONNGUARD.ServiceWizard.RadminPort')}</label>
        <input id="connection-guard-redundancy-port" name="redundancyPort" type="number" min="1" max="65535" step="1" value="${escapeHtml(radminEndpoint?.port || '30000')}" />
      </div>
    `
        : ''
    }
    ${renderReadinessHtml(redundancy, key => game.i18n.localize(key))}
  `
}

function renderServiceChoice(selectedType) {
  const options = SERVICES.map(
    service =>
      `<option value="${service.type}" ${service.type === selectedType ? 'selected' : ''}>${escapeHtml(game.i18n.localize(service.labelKey))}</option>`,
  ).join('')

  return `
    <p>${game.i18n.localize('CONNGUARD.ServiceWizard.Intro')}</p>
    <p class="notes"><i class="fas fa-circle-info"></i> ${game.i18n.localize('CONNGUARD.ServiceWizard.NoWebRtc')}</p>
    <div class="form-group">
      <label for="connection-guard-service">${game.i18n.localize('CONNGUARD.ServiceWizard.Service')}</label>
      <select id="connection-guard-service" name="service">${options}</select>
    </div>
  `
}

function buildProfile(service, label, result) {
  let url
  let notes

  if (service.type === ROUTE_TYPES.RADMIN) {
    const host = String(result.host || '').trim()
    const port = Number(result.port)
    if (!isValidRadminHost(host) || !Number.isInteger(port) || port < 1 || port > 65535) return null
    url = `http://${host}:${port}`
    notes = game.i18n.localize('CONNGUARD.ServiceWizard.Note.Radmin')
  } else {
    url = String(result.endpoint || '').trim()
    if (!url) return null
    notes = game.i18n.localize(
      SERVICE_CATALOG[service.type]?.hintKey || 'CONNGUARD.ServiceWizard.Note.Custom',
    )
  }

  return normalizeRouteProfile({
    id: service.id,
    label,
    type: service.type,
    url,
    requiresVpn: service.type === ROUTE_TYPES.RADMIN,
    priority: 1,
    notes,
  })
}
