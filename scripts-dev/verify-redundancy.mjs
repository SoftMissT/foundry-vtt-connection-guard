// Verificação da Tarefa 2 (RouteRedundancyManager) — roda fora do Foundry.
// Funções puras são testadas diretamente e o manager é instanciado com
// `game`/`location` mockados.
import {
  REDUNDANCY_MODES,
  REDUNDANCY_STATES,
  CURRENT_ROUTES,
  safeParseRedundancy,
  isValidRadminUrl,
  buildFailoverRedirectUrl,
  resolveRedundancyMode,
  resolveCurrentRoute,
  initialStateFor,
  RouteRedundancyManager,
} from '../scripts/route-redundancy-manager.js'
import { JOURNAL_TYPES } from '../scripts/constants.js'
import { resolveChipView } from '../scripts/active-route-chip.js'
import {
  buildHostFirewallCommand,
  extractRadminPort,
  renderReadinessHtml,
  safeParseRedundancy as safeParseReadiness,
} from '../scripts/radmin-readiness.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts')

let checks = 0
let failures = 0
const report = []

function check(label, actual, expected) {
  checks += 1
  const ok = Object.is(actual, expected)
  if (!ok) failures += 1
  report.push(`${ok ? 'PASS' : 'FAIL'} | ${label} | esperado=${expected} obtido=${actual}`)
}

function setLocation(origin) {
  try {
    Object.defineProperty(globalThis, 'location', {
      value: { origin, protocol: origin.startsWith('https') ? 'https:' : 'http:' },
      configurable: true,
      writable: true,
    })
  } catch {
    globalThis.location = { origin, protocol: origin.startsWith('https') ? 'https:' : 'http:' }
  }
}

function runScenario({ id, name, activeRoute, redundancyRaw, origin, expect }) {
  const label = `${id} ${name}`
  const previous = { game: globalThis.game, location: globalThis.location }

  try {
    globalThis.game = {
      settings: {
        get: (_moduleId, key) => {
          if (key === 'activeRoute') return activeRoute ? JSON.stringify(activeRoute) : ''
          if (key === 'redundancyConfig') return redundancyRaw
          return ''
        },
      },
    }
    setLocation(origin)

    const manager = new RouteRedundancyManager()
    manager.initialize()

    check(`${label} | mode`, manager.mode, expect.mode)
    check(`${label} | currentRoute`, manager.currentRoute, expect.route)
    check(`${label} | state`, manager.state, expect.state)
    check(`${label} | isRedundancyActive`, manager.isRedundancyActive(), expect.active)
  } catch (err) {
    failures += 1
    report.push(`FAIL | ${label} | exceção: ${err?.message ?? err}`)
  } finally {
    globalThis.game = previous.game
    if (previous.location === undefined) {
      delete globalThis.location
    } else {
      globalThis.location = previous.location
    }
  }
}

const RADMIN = { type: 'radmin', url: 'http://26.10.20.30:30000' }
const PLAYIT = { type: 'playit', url: 'http://softmisst.playit.plus:1051' }
const NGROK = { type: 'ngrok', url: 'https://abc.ngrok-free.app' }
const CLOUDFLARE = { type: 'cloudflare', url: 'https://abc.trycloudflare.com' }
const OFF = '{"enabled":false,"radminUrl":""}'
const ON_RADMIN = '{"enabled":true,"radminUrl":"http://26.10.20.30:30000"}'

const scenarios = [
  {
    id: 'CEN-01',
    name: 'Radmin como ACTIVE_ROUTE → RADMIN_ONLY',
    activeRoute: RADMIN,
    redundancyRaw: OFF,
    origin: 'http://26.10.20.30:30000',
    expect: {
      mode: REDUNDANCY_MODES.RADMIN_ONLY,
      route: CURRENT_ROUTES.RADMIN,
      state: REDUNDANCY_STATES.RADMIN_CONNECTED,
      active: false,
    },
  },
  {
    id: 'CEN-02',
    name: 'Playit sem fallback → PRIMARY_ONLY',
    activeRoute: PLAYIT,
    redundancyRaw: OFF,
    origin: 'http://softmisst.playit.plus:1051',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_ONLY,
      route: CURRENT_ROUTES.PRIMARY,
      state: REDUNDANCY_STATES.PRIMARY_CONNECTED,
      active: false,
    },
  },
  {
    id: 'CEN-03',
    name: 'ngrok sem fallback → PRIMARY_ONLY',
    activeRoute: NGROK,
    redundancyRaw: OFF,
    origin: 'https://abc.ngrok-free.app',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_ONLY,
      route: CURRENT_ROUTES.PRIMARY,
      state: REDUNDANCY_STATES.PRIMARY_CONNECTED,
      active: false,
    },
  },
  {
    id: 'CEN-04',
    name: 'Cloudflare sem fallback → PRIMARY_ONLY',
    activeRoute: CLOUDFLARE,
    redundancyRaw: OFF,
    origin: 'https://abc.trycloudflare.com',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_ONLY,
      route: CURRENT_ROUTES.PRIMARY,
      state: REDUNDANCY_STATES.PRIMARY_CONNECTED,
      active: false,
    },
  },
  {
    id: 'CEN-05',
    name: 'Playit + Radmin enabled, acesso pelo Playit → PRIMARY_PLUS_RADMIN / primary',
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: 'http://softmisst.playit.plus:1051',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
      route: CURRENT_ROUTES.PRIMARY,
      state: REDUNDANCY_STATES.PRIMARY_CONNECTED,
      active: true,
    },
  },
  {
    id: 'CEN-06',
    name: 'Playit + Radmin enabled, acesso pelo IP Radmin → PRIMARY_PLUS_RADMIN / radmin',
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: 'http://26.10.20.30:30000',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
      route: CURRENT_ROUTES.RADMIN,
      state: REDUNDANCY_STATES.RADMIN_CONNECTED,
      active: true,
    },
  },
  {
    id: 'CEN-07',
    name: 'REDUNDANCY_CONFIG JSON corrompido → não crasha',
    activeRoute: PLAYIT,
    redundancyRaw: '{"enabled":true, broken',
    origin: 'http://softmisst.playit.plus:1051',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_ONLY,
      route: CURRENT_ROUTES.PRIMARY,
      state: REDUNDANCY_STATES.PRIMARY_CONNECTED,
      active: false,
    },
  },
  {
    id: 'CEN-08',
    name: 'radminUrl inválida + enabled:true → não crasha e NÃO ativa redundância',
    activeRoute: PLAYIT,
    redundancyRaw: '{"enabled":true,"radminUrl":"http://192.168.1.10:30000"}',
    origin: 'http://softmisst.playit.plus:1051',
    expect: {
      mode: REDUNDANCY_MODES.UNSUPPORTED,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-09a',
    name: 'LAN → UNSUPPORTED',
    activeRoute: { type: 'local', url: 'http://192.168.0.10:30000' },
    redundancyRaw: ON_RADMIN,
    origin: 'http://192.168.0.10:30000',
    expect: {
      mode: REDUNDANCY_MODES.UNSUPPORTED,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-09b',
    name: 'Direct → UNSUPPORTED',
    activeRoute: { type: 'direct', url: 'http://200.200.200.200:30000' },
    redundancyRaw: ON_RADMIN,
    origin: 'http://200.200.200.200:30000',
    expect: {
      mode: REDUNDANCY_MODES.UNSUPPORTED,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-09c',
    name: 'Custom → UNSUPPORTED',
    activeRoute: { type: 'custom', url: 'https://meu.dominio.com' },
    redundancyRaw: ON_RADMIN,
    origin: 'https://meu.dominio.com',
    expect: {
      mode: REDUNDANCY_MODES.UNSUPPORTED,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-09d',
    name: 'sem ACTIVE_ROUTE → UNSUPPORTED',
    activeRoute: null,
    redundancyRaw: ON_RADMIN,
    origin: 'http://softmisst.playit.plus:1051',
    expect: {
      mode: REDUNDANCY_MODES.UNSUPPORTED,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-10',
    name: 'Playit sem fallback, acesso por URL LAN → PRIMARY_ONLY / NONE / IDLE',
    activeRoute: PLAYIT,
    redundancyRaw: OFF,
    origin: 'http://192.168.0.50:30000',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_ONLY,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-11',
    name: 'Playit + Radmin enabled, acesso por terceira URL → PRIMARY_PLUS_RADMIN / NONE / IDLE',
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: 'https://algum.terceiro.com:30000',
    expect: {
      mode: REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: true,
    },
  },
  {
    id: 'CEN-12',
    name: 'Radmin ativo, navegador em outra origin → RADMIN_ONLY / NONE / IDLE',
    activeRoute: RADMIN,
    redundancyRaw: OFF,
    origin: 'http://192.168.0.50:30000',
    expect: {
      mode: REDUNDANCY_MODES.RADMIN_ONLY,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
  {
    id: 'CEN-13',
    name: 'Playit na mesma origin do Radmin → UNSUPPORTED / NONE / IDLE / false',
    activeRoute: { type: 'playit', url: 'http://26.10.20.30:30000' },
    redundancyRaw: ON_RADMIN,
    origin: 'http://26.10.20.30:30000',
    expect: {
      mode: REDUNDANCY_MODES.UNSUPPORTED,
      route: CURRENT_ROUTES.NONE,
      state: REDUNDANCY_STATES.IDLE,
      active: false,
    },
  },
]

for (const scenario of scenarios) {
  runScenario(scenario)
}

// --- isValidRadminUrl: exemplos do operador ---
check(
  'isValidRadminUrl | http://26.10.20.30:30000',
  isValidRadminUrl('http://26.10.20.30:30000'),
  true,
)
check(
  'isValidRadminUrl | https://26.50.60.70:443',
  isValidRadminUrl('https://26.50.60.70:443'),
  true,
)
check(
  'isValidRadminUrl | http://192.168.1.10:30000',
  isValidRadminUrl('http://192.168.1.10:30000'),
  false,
)
check('isValidRadminUrl | https://example.com', isValidRadminUrl('https://example.com'), false)
check(
  'isValidRadminUrl | http://26.999.1.1:30000',
  isValidRadminUrl('http://26.999.1.1:30000'),
  false,
)
check('isValidRadminUrl | not-a-url', isValidRadminUrl('not-a-url'), false)
check('isValidRadminUrl | vazio', isValidRadminUrl(''), false)
check('isValidRadminUrl | null', isValidRadminUrl(null), false)
check('isValidRadminUrl | ftp://26.1.1.1', isValidRadminUrl('ftp://26.1.1.1'), false)

// --- Parsing defensivo do REDUNDANCY_CONFIG ---
check(
  'safeParse | JSON válido',
  JSON.stringify(safeParseRedundancy(ON_RADMIN)),
  JSON.stringify({ enabled: true, radminUrl: 'http://26.10.20.30:30000' }),
)
check(
  'safeParse | JSON corrompido',
  JSON.stringify(safeParseRedundancy('{nope')),
  JSON.stringify({ enabled: false, radminUrl: '' }),
)
check(
  'safeParse | vazio',
  JSON.stringify(safeParseRedundancy('')),
  JSON.stringify({ enabled: false, radminUrl: '' }),
)
check(
  'safeParse | null',
  JSON.stringify(safeParseRedundancy(null)),
  JSON.stringify({ enabled: false, radminUrl: '' }),
)
check(
  'safeParse | objeto direto',
  JSON.stringify(safeParseRedundancy({ enabled: true, radminUrl: 'http://26.10.20.30:30000' })),
  JSON.stringify({ enabled: true, radminUrl: 'http://26.10.20.30:30000' }),
)

// --- Funções puras diretas (sem Foundry) ---
check(
  'resolveMode | CEN-01',
  resolveRedundancyMode(RADMIN, { enabled: false }),
  REDUNDANCY_MODES.RADMIN_ONLY,
)
check(
  'resolveRoute | CEN-01',
  resolveCurrentRoute(
    REDUNDANCY_MODES.RADMIN_ONLY,
    'http://26.10.20.30:30000',
    'http://26.10.20.30:30000',
    '',
  ),
  CURRENT_ROUTES.RADMIN,
)
check(
  'initialState | CEN-01',
  initialStateFor(REDUNDANCY_MODES.RADMIN_ONLY, CURRENT_ROUTES.RADMIN),
  REDUNDANCY_STATES.RADMIN_CONNECTED,
)
check(
  'resolveMode | CEN-05',
  resolveRedundancyMode(PLAYIT, { enabled: true, radminUrl: 'http://26.10.20.30:30000' }),
  REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
)
check(
  'resolveRoute | CEN-05 (origem primária)',
  resolveCurrentRoute(
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    'http://softmisst.playit.plus:1051',
    'http://softmisst.playit.plus:1051',
    'http://26.10.20.30:30000',
  ),
  CURRENT_ROUTES.PRIMARY,
)
check(
  'resolveRoute | CEN-06 (origem radmin)',
  resolveCurrentRoute(
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    'http://26.10.20.30:30000',
    'http://softmisst.playit.plus:1051',
    'http://26.10.20.30:30000',
  ),
  CURRENT_ROUTES.RADMIN,
)
check(
  'resolveRoute | CEN-10 (LAN não é primary)',
  resolveCurrentRoute(
    REDUNDANCY_MODES.PRIMARY_ONLY,
    'http://192.168.0.50:30000',
    'http://softmisst.playit.plus:1051',
    '',
  ),
  CURRENT_ROUTES.NONE,
)
check(
  'resolveRoute | CEN-11 (terceira URL não é nem primary nem radmin)',
  resolveCurrentRoute(
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    'https://algum.terceiro.com:30000',
    'http://softmisst.playit.plus:1051',
    'http://26.10.20.30:30000',
  ),
  CURRENT_ROUTES.NONE,
)
check(
  'resolveRoute | CEN-12 (outra origin não é radmin ativa)',
  resolveCurrentRoute(
    REDUNDANCY_MODES.RADMIN_ONLY,
    'http://192.168.0.50:30000',
    'http://26.10.20.30:30000',
    '',
  ),
  CURRENT_ROUTES.NONE,
)
check(
  'resolveRoute | NÃO assume not-radmin = primary',
  resolveCurrentRoute(
    REDUNDANCY_MODES.PRIMARY_ONLY,
    'http://outra.origin.com',
    'http://softmisst.playit.plus:1051',
    '',
  ),
  CURRENT_ROUTES.NONE,
)
check(
  'initialState | PRIMARY_PLUS_RADMIN + NONE → IDLE',
  initialStateFor(REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN, CURRENT_ROUTES.NONE),
  REDUNDANCY_STATES.IDLE,
)
check(
  'initialState | PRIMARY_ONLY + NONE → IDLE',
  initialStateFor(REDUNDANCY_MODES.PRIMARY_ONLY, CURRENT_ROUTES.NONE),
  REDUNDANCY_STATES.IDLE,
)
check(
  'initialState | RADMIN_ONLY + NONE → IDLE',
  initialStateFor(REDUNDANCY_MODES.RADMIN_ONLY, CURRENT_ROUTES.NONE),
  REDUNDANCY_STATES.IDLE,
)
check(
  'resolveMode | CEN-08 (radminUrl fora da faixa)',
  resolveRedundancyMode(PLAYIT, { enabled: true, radminUrl: 'http://192.168.1.10:30000' }),
  REDUNDANCY_MODES.UNSUPPORTED,
)
check(
  'resolveMode | CEN-08b (radminUrl sem protocolo)',
  resolveRedundancyMode(PLAYIT, { enabled: true, radminUrl: 'not-a-url' }),
  REDUNDANCY_MODES.UNSUPPORTED,
)
check(
  'resolveMode | sem ACTIVE_ROUTE',
  resolveRedundancyMode(null, { enabled: true }),
  REDUNDANCY_MODES.UNSUPPORTED,
)
check(
  'resolveMode | custom com enabled',
  resolveRedundancyMode({ type: 'custom', url: 'https://meu.dominio.com' }, { enabled: true }),
  REDUNDANCY_MODES.UNSUPPORTED,
)
check(
  'resolveMode | CEN-13 (PRIMARY === FALLBACK)',
  resolveRedundancyMode(
    { type: 'playit', url: 'http://26.10.20.30:30000' },
    { enabled: true, radminUrl: 'http://26.10.20.30:30000' },
  ),
  REDUNDANCY_MODES.UNSUPPORTED,
)

// =====================================================================
// Tarefa 3 — timer + eventos de conexão + decisão de failover (fake timers)
// =====================================================================

const T3_ORIGINAL_TIMERS = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
}

function makeFakeTimers() {
  const timers = []
  let nextId = 0
  globalThis.setTimeout = (fn, ms) => {
    nextId += 1
    timers.push({ id: nextId, fn, ms, cancelled: false })
    return nextId
  }
  globalThis.clearTimeout = id => {
    const timer = timers.find(t => t.id === id)
    if (timer) timer.cancelled = true
  }
  return {
    active: () => timers.filter(t => !t.cancelled),
    fire: id => {
      const timer = timers.find(t => t.id === id)
      if (!timer || timer.cancelled) throw new Error(`timer ${id} não está ativo`)
      timer.cancelled = true
      timer.fn()
    },
  }
}

function setNavigator(onLine) {
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine },
      configurable: true,
      writable: true,
    })
  } catch {
    globalThis.navigator = { onLine }
  }
}

function t3Teardown() {
  globalThis.setTimeout = T3_ORIGINAL_TIMERS.setTimeout
  globalThis.clearTimeout = T3_ORIGINAL_TIMERS.clearTimeout
  delete globalThis.game
  delete globalThis.window
  delete globalThis.navigator
  delete globalThis.location
}

function t3Setup({
  activeRoute,
  redundancyRaw,
  origin,
  href = null,
  failoverTimeout = 30,
  socketConnected = true,
  onLine = true,
  journal = null,
  onReplace = null,
}) {
  const fakeTimers = makeFakeTimers()
  const socketMocks = {}
  const windowMocks = {}
  const replaceCalls = []
  setNavigator(onLine)
  globalThis.window = {
    addEventListener: (event, handler) => {
      windowMocks[event] = handler
      windowMocks[`${event}Count`] = (windowMocks[`${event}Count`] || 0) + 1
    },
    removeEventListener: (event, handler) => {
      if (windowMocks[event] === handler) {
        windowMocks[event] = null
        windowMocks[`${event}Count`] = Math.max(0, (windowMocks[`${event}Count`] || 1) - 1)
      }
    },
  }
  globalThis.game = {
    settings: {
      get: (_moduleId, key) => {
        if (key === 'activeRoute') return activeRoute ? JSON.stringify(activeRoute) : ''
        if (key === 'redundancyConfig') return redundancyRaw
        if (key === 'failoverTimeout') return failoverTimeout
        return ''
      },
    },
    socket: {
      connected: socketConnected,
      on: (event, handler) => {
        socketMocks[event] = handler
        socketMocks[`${event}Count`] = (socketMocks[`${event}Count`] || 0) + 1
      },
      off: (event, handler) => {
        if (socketMocks[event] === handler) {
          socketMocks[event] = null
          socketMocks[`${event}Count`] = Math.max(0, (socketMocks[`${event}Count`] || 1) - 1)
        }
      },
    },
  }
  const fullHref = href ?? `${origin}/game`
  const locationUrl = new URL(fullHref)
  globalThis.location = {
    origin: locationUrl.origin,
    protocol: locationUrl.protocol,
    href: fullHref,
    replace: target => {
      replaceCalls.push(target)
      onReplace?.(target)
    },
  }
  const manager = new RouteRedundancyManager(journal)
  manager.initialize()
  manager.start()
  return { manager, fakeTimers, socketMocks, windowMocks, game: globalThis.game, replaceCalls }
}

const T3_PLAYIT_ORIGIN = 'http://softmisst.playit.plus:1051'
const T3_RADMIN_ORIGIN = 'http://26.10.20.30:30000'

// T3-01 PRIMARY_PLUS_RADMIN + PRIMARY + disconnect → PRIMARY_RETRYING + 1 timer
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  check('T3-01 estado inicial', env.manager.state, REDUNDANCY_STATES.PRIMARY_CONNECTED)
  env.socketMocks.disconnect()
  check('T3-01 state após disconnect', env.manager.state, REDUNDANCY_STATES.PRIMARY_RETRYING)
  check('T3-01 timers ativos', env.fakeTimers.active().length, 1)
  t3Teardown()
}

// T3-02 segundo disconnect → continua exatamente 1 timer
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  env.socketMocks.disconnect()
  check('T3-02 timers ativos', env.fakeTimers.active().length, 1)
  t3Teardown()
}

// T3-03 connect antes do timeout → timer cancelado + PRIMARY_CONNECTED
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  check('T3-03 timer antes do connect', env.fakeTimers.active().length, 1)
  env.socketMocks.connect()
  check('T3-03 state após connect', env.manager.state, REDUNDANCY_STATES.PRIMARY_CONNECTED)
  check('T3-03 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-04 timeout com socket ainda desconectado → RADMIN_FAILOVER
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  const timer = env.fakeTimers.active()[0]
  env.fakeTimers.fire(timer.id)
  check('T3-04 state', env.manager.state, REDUNDANCY_STATES.RADMIN_FAILOVER)
  t3Teardown()
}

// T3-05 timeout mas socket voltou → NÃO RADMIN_FAILOVER
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  env.game.socket.connected = true
  const timer = env.fakeTimers.active()[0]
  env.fakeTimers.fire(timer.id)
  check('T3-05 não é failover', env.manager.state === REDUNDANCY_STATES.RADMIN_FAILOVER, false)
  check('T3-05 state', env.manager.state, REDUNDANCY_STATES.PRIMARY_CONNECTED)
  t3Teardown()
}

// T3-06 currentRoute = RADMIN → 0 listeners, 0 timers
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_RADMIN_ORIGIN })
  check('T3-06 rota inicial', env.manager.currentRoute, CURRENT_ROUTES.RADMIN)
  check('T3-06 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T3-06 socket connect listeners', env.socketMocks.connectCount ?? 0, 0)
  check('T3-06 window listeners', env.windowMocks.onlineCount ?? 0, 0)
  check('T3-06 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-07 currentRoute = NONE → 0 listeners, 0 timers
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: 'https://algum.terceiro.com:30000',
  })
  check('T3-07 rota inicial', env.manager.currentRoute, CURRENT_ROUTES.NONE)
  check('T3-07 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T3-07 socket connect listeners', env.socketMocks.connectCount ?? 0, 0)
  check('T3-07 window listeners', env.windowMocks.onlineCount ?? 0, 0)
  check('T3-07 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-08 PRIMARY_ONLY → 0 listeners, 0 timers
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: OFF, origin: T3_PLAYIT_ORIGIN })
  check('T3-08 mode', env.manager.mode, REDUNDANCY_MODES.PRIMARY_ONLY)
  check('T3-08 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T3-08 socket connect listeners', env.socketMocks.connectCount ?? 0, 0)
  check('T3-08 window listeners', env.windowMocks.onlineCount ?? 0, 0)
  check('T3-08 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-09 RADMIN_ONLY → 0 listeners, 0 timers
{
  const env = t3Setup({ activeRoute: RADMIN, redundancyRaw: OFF, origin: T3_RADMIN_ORIGIN })
  check('T3-09 mode', env.manager.mode, REDUNDANCY_MODES.RADMIN_ONLY)
  check('T3-09 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T3-09 socket connect listeners', env.socketMocks.connectCount ?? 0, 0)
  check('T3-09 window listeners', env.windowMocks.onlineCount ?? 0, 0)
  check('T3-09 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-09b UNSUPPORTED → 0 listeners, 0 timers
{
  const env = t3Setup({
    activeRoute: { type: 'local', url: 'http://192.168.0.10:30000' },
    redundancyRaw: ON_RADMIN,
    origin: 'http://192.168.0.10:30000',
  })
  check('T3-09b mode', env.manager.mode, REDUNDANCY_MODES.UNSUPPORTED)
  check('T3-09b socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T3-09b socket connect listeners', env.socketMocks.connectCount ?? 0, 0)
  check('T3-09b window listeners', env.windowMocks.onlineCount ?? 0, 0)
  check('T3-09b timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-10 browser offline no disconnect → PRIMARY_RETRYING, nenhum timer
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    onLine: false,
  })
  env.socketMocks.disconnect()
  check('T3-10 state', env.manager.state, REDUNDANCY_STATES.PRIMARY_RETRYING)
  check('T3-10 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-11 offline durante timer → timer cancelado
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  check('T3-11 timer antes do offline', env.fakeTimers.active().length, 1)
  env.windowMocks.offline()
  check('T3-11 timers ativos', env.fakeTimers.active().length, 0)
  check('T3-11 state mantido', env.manager.state, REDUNDANCY_STATES.PRIMARY_RETRYING)
  t3Teardown()
}

// T3-12 online novamente + socket ainda down → novo timer
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  env.windowMocks.offline()
  env.game.socket.connected = false
  env.windowMocks.online()
  check('T3-12 timers ativos', env.fakeTimers.active().length, 1)
  check('T3-12 state', env.manager.state, REDUNDANCY_STATES.PRIMARY_RETRYING)
  t3Teardown()
}

// T3-13 stop() → timer + listeners removidos (e stop duplo sem erro)
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  check('T3-13 timer antes do stop', env.fakeTimers.active().length, 1)
  env.manager.stop()
  check('T3-13 timers ativos', env.fakeTimers.active().length, 0)
  check('T3-13 disconnect removido', env.socketMocks.disconnect, null)
  check('T3-13 connect removido', env.socketMocks.connect, null)
  check('T3-13 online removido', env.windowMocks.online, null)
  check('T3-13 offline removido', env.windowMocks.offline, null)
  check('T3-13 disconnect count 0', env.socketMocks.disconnectCount, 0)
  check('T3-13 connect count 0', env.socketMocks.connectCount, 0)
  check('T3-13 online count 0', env.windowMocks.onlineCount, 0)
  check('T3-13 offline count 0', env.windowMocks.offlineCount, 0)
  let errored = false
  try {
    env.manager.stop()
  } catch {
    errored = true
  }
  check('T3-13 stop duplo sem erro', errored, false)
  t3Teardown()
}

// T3-16 start() chamado duas vezes → somente 1 conjunto de listeners
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.manager.start()
  check('T3-16 disconnect registrado 1x', env.socketMocks.disconnectCount, 1)
  check('T3-16 connect registrado 1x', env.socketMocks.connectCount, 1)
  check('T3-16 online registrado 1x', env.windowMocks.onlineCount, 1)
  check('T3-16 offline registrado 1x', env.windowMocks.offlineCount, 1)
  t3Teardown()
}

// T3-17 RADMIN_FAILOVER + connect antes de qualquer redirect → PRIMARY_CONNECTED
{
  const env = t3Setup({ activeRoute: PLAYIT, redundancyRaw: ON_RADMIN, origin: T3_PLAYIT_ORIGIN })
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  const timer = env.fakeTimers.active()[0]
  env.fakeTimers.fire(timer.id)
  check('T3-17 após timeout', env.manager.state, REDUNDANCY_STATES.RADMIN_FAILOVER)
  env.game.socket.connected = true
  env.socketMocks.connect()
  check('T3-17 connect pós-failover', env.manager.state, REDUNDANCY_STATES.PRIMARY_CONNECTED)
  check('T3-17 timers ativos', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T3-14 timeout inválido/NaN → usa 30s
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    failoverTimeout: 'abc',
  })
  env.socketMocks.disconnect()
  check('T3-14 timeout ms', env.fakeTimers.active()[0].ms, 30000)
  t3Teardown()
}

// T3-15 timeout <10 ou >120 → clamp correto; null → 30s
{
  const low = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    failoverTimeout: 5,
  })
  low.socketMocks.disconnect()
  check('T3-15 clamp baixo', low.fakeTimers.active()[0].ms, 10000)
  t3Teardown()

  const high = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    failoverTimeout: 500,
  })
  high.socketMocks.disconnect()
  check('T3-15 clamp alto', high.fakeTimers.active()[0].ms, 120000)
  t3Teardown()

  const nul = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    failoverTimeout: null,
  })
  nul.socketMocks.disconnect()
  check('T3-15 null → 30s', nul.fakeTimers.active()[0].ms, 30000)
  t3Teardown()
}

// =====================================================================
// Tarefa 4 — execução segura do redirect para Radmin
// =====================================================================

// T4-01..T4-07 — buildFailoverRedirectUrl (função pura, sem Foundry)
check(
  'T4-01 raiz → origin radmin + /',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/', 'http://26.10.20.30:30000'),
  'http://26.10.20.30:30000/',
)
check(
  'T4-02 /game → origin radmin + /game',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/game', 'http://26.10.20.30:30000'),
  'http://26.10.20.30:30000/game',
)
check(
  'T4-03 routePrefix preservado',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/foundry/game', 'http://26.10.20.30:30000'),
  'http://26.10.20.30:30000/foundry/game',
)
check(
  'T4-04 query+hash descartados',
  buildFailoverRedirectUrl(
    'https://mesa.exemplo.com/foundry/game?foo=bar#teste',
    'http://26.10.20.30:30000',
  ),
  'http://26.10.20.30:30000/foundry/game',
)
check(
  'T4-05 radminUrl inválida → null',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/', 'not-a-url'),
  null,
)
check(
  'T4-06 username/password → null',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/', 'http://user:pass@26.10.20.30:30000'),
  null,
)
check(
  'T4-07a pathname != / → null',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/', 'http://26.10.20.30:30000/foo'),
  null,
)
check(
  'T4-07b querystring → null',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/', 'http://26.10.20.30:30000?token=abc'),
  null,
)
check(
  'T4-07c hash → null',
  buildFailoverRedirectUrl('https://mesa.exemplo.com/', 'http://26.10.20.30:30000/#teste'),
  null,
)
check('isValidRadminUrl | user:pass', isValidRadminUrl('http://user:pass@26.10.20.30:30000'), false)
check('isValidRadminUrl | path /foo', isValidRadminUrl('http://26.10.20.30:30000/foo'), false)
check(
  'isValidRadminUrl | querystring',
  isValidRadminUrl('http://26.10.20.30:30000?token=abc'),
  false,
)
check('isValidRadminUrl | hash', isValidRadminUrl('http://26.10.20.30:30000/#teste'), false)

const T4_PRIMARY_HREF = `${T3_PLAYIT_ORIGIN}/game`

// T4-08 timeout válido → RADMIN_FAILOVER + exatamente 1 location.replace()
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    href: T4_PRIMARY_HREF,
  })
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  env.fakeTimers.fire(env.fakeTimers.active()[0].id)
  check('T4-08 state', env.manager.state, REDUNDANCY_STATES.RADMIN_FAILOVER)
  check('T4-08 replace calls', env.replaceCalls.length, 1)
  check('T4-08 target', env.replaceCalls[0], 'http://26.10.20.30:30000/game')
  t3Teardown()
}

// T4-09 socket voltou antes da navegação → zero redirects + PRIMARY_CONNECTED
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    href: T4_PRIMARY_HREF,
  })
  env.socketMocks.disconnect()
  env.game.socket.connected = true
  env.fakeTimers.fire(env.fakeTimers.active()[0].id)
  check('T4-09 state', env.manager.state, REDUNDANCY_STATES.PRIMARY_CONNECTED)
  check('T4-09 replace calls', env.replaceCalls.length, 0)
  t3Teardown()
}

// T4-10 browser offline → zero redirects
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    href: T4_PRIMARY_HREF,
    onLine: false,
  })
  env.socketMocks.disconnect()
  check('T4-10 timers', env.fakeTimers.active().length, 0)
  check('T4-10 replace calls', env.replaceCalls.length, 0)
  t3Teardown()
}

// T4-11 currentRoute = RADMIN → zero redirects
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_RADMIN_ORIGIN,
    href: `${T3_RADMIN_ORIGIN}/game`,
  })
  check('T4-11 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T4-11 state', env.manager.state, REDUNDANCY_STATES.RADMIN_CONNECTED)
  check('T4-11 replace calls', env.replaceCalls.length, 0)
  t3Teardown()
}

// T4-12 currentRoute = NONE → zero redirects
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: 'https://algum.terceiro.com:30000',
    href: 'https://algum.terceiro.com:30000/game',
  })
  check('T4-12 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T4-12 replace calls', env.replaceCalls.length, 0)
  t3Teardown()
}

// T4-13 PRIMARY_ONLY / RADMIN_ONLY / UNSUPPORTED → zero redirects
{
  const po = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: OFF,
    origin: T3_PLAYIT_ORIGIN,
    href: T4_PRIMARY_HREF,
  })
  check('T4-13 PRIMARY_ONLY listeners', po.socketMocks.disconnectCount ?? 0, 0)
  check('T4-13 PRIMARY_ONLY replace', po.replaceCalls.length, 0)
  t3Teardown()

  const ro = t3Setup({
    activeRoute: RADMIN,
    redundancyRaw: OFF,
    origin: T3_RADMIN_ORIGIN,
    href: `${T3_RADMIN_ORIGIN}/game`,
  })
  check('T4-13 RADMIN_ONLY listeners', ro.socketMocks.disconnectCount ?? 0, 0)
  check('T4-13 RADMIN_ONLY replace', ro.replaceCalls.length, 0)
  t3Teardown()

  const us = t3Setup({
    activeRoute: { type: 'local', url: 'http://192.168.0.10:30000' },
    redundancyRaw: ON_RADMIN,
    origin: 'http://192.168.0.10:30000',
    href: 'http://192.168.0.10:30000/game',
  })
  check('T4-13 UNSUPPORTED listeners', us.socketMocks.disconnectCount ?? 0, 0)
  check('T4-13 UNSUPPORTED replace', us.replaceCalls.length, 0)
  t3Teardown()
}

// T4-14 tentativa duplicada → location.replace exatamente 1 vez
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    href: T4_PRIMARY_HREF,
  })
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  env.fakeTimers.fire(env.fakeTimers.active()[0].id)
  check('T4-14 replace após 1º ciclo', env.replaceCalls.length, 1)
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  env.fakeTimers.fire(env.fakeTimers.active()[0].id)
  check('T4-14 replace após 2º ciclo', env.replaceCalls.length, 1)
  t3Teardown()
}

// T4-15 location.replace lança erro → sem loop, journal com erro, sem 2ª tentativa
{
  const journalLogs = []
  const journal = { log: (type, data) => journalLogs.push({ type, ...data }) }
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_PLAYIT_ORIGIN,
    href: T4_PRIMARY_HREF,
    journal,
    onReplace: () => {
      throw new Error('boom')
    },
  })
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  env.fakeTimers.fire(env.fakeTimers.active()[0].id)
  check('T4-15 replace tentativas', env.replaceCalls.length, 1)
  check(
    'T4-15 journal erro',
    journalLogs.some(e => e.type === JOURNAL_TYPES.ERROR && e.event === 'failover-redirect-error'),
    true,
  )
  env.socketMocks.disconnect()
  env.game.socket.connected = false
  env.fakeTimers.fire(env.fakeTimers.active()[0].id)
  check('T4-15 sem 2ª tentativa', env.replaceCalls.length, 1)
  t3Teardown()
}

// T4-16 nova inicialização já pela origin Radmin → PPR / RADMIN / RADMIN_CONNECTED
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_RADMIN_ORIGIN,
    href: `${T3_RADMIN_ORIGIN}/game`,
  })
  check('T4-16 mode', env.manager.mode, REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN)
  check('T4-16 route', env.manager.currentRoute, CURRENT_ROUTES.RADMIN)
  check('T4-16 state', env.manager.state, REDUNDANCY_STATES.RADMIN_CONNECTED)
  check('T4-16 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T4-16 timers', env.fakeTimers.active().length, 0)
  t3Teardown()
}

// T4-17 PRIMARY volta depois de estar no Radmin → sem failback, zero redirect
{
  const env = t3Setup({
    activeRoute: PLAYIT,
    redundancyRaw: ON_RADMIN,
    origin: T3_RADMIN_ORIGIN,
    href: `${T3_RADMIN_ORIGIN}/game`,
  })
  check('T4-17 socket listeners', env.socketMocks.disconnectCount ?? 0, 0)
  check('T4-17 window listeners', env.windowMocks.onlineCount ?? 0, 0)
  check('T4-17 timers', env.fakeTimers.active().length, 0)
  check('T4-17 replace calls', env.replaceCalls.length, 0)
  check('T4-17 state', env.manager.state, REDUNDANCY_STATES.RADMIN_CONNECTED)
  t3Teardown()
}

// =====================================================================
// Tarefa 5 — Active Route Chip / estado visual da redundância
// =====================================================================

const PLAYIT_ROUTE = {
  type: 'playit',
  url: 'http://softmisst.playit.plus:1051',
  label: 'playit.gg',
}
const RADMIN_ROUTE = { type: 'radmin', url: 'http://26.10.20.30:30000', label: 'Radmin VPN' }
const CLOUDFLARE_ROUTE = {
  type: 'cloudflare',
  url: 'https://abc.trycloudflare.com',
  label: 'Cloudflare Tunnel',
}

// T5-01 PPR + PRIMARY → Playit/Primary, sem Radmin fallback
{
  const v = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.PRIMARY,
    REDUNDANCY_STATES.PRIMARY_CONNECTED,
  )
  check('T5-01 kind', v.kind, 'primary')
  check('T5-01 label', v.label, 'playit.gg')
  check('T5-01 fallback', v.fallback, false)
  check('T5-01 sem labelKey RadminFallback', v.labelKey ?? null, null)
}

// T5-02 PPR + RADMIN → Radmin (Fallback)
{
  const v = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.RADMIN,
    REDUNDANCY_STATES.RADMIN_CONNECTED,
  )
  check('T5-02 kind', v.kind, 'radmin-fallback')
  check('T5-02 labelKey', v.labelKey, 'CONNGUARD.Chip.RadminFallback')
  check('T5-02 fallback', v.fallback, true)
}

// T5-03 RADMIN_ONLY + RADMIN → Radmin, NÃO (Fallback)
{
  const v = resolveChipView(
    RADMIN_ROUTE,
    REDUNDANCY_MODES.RADMIN_ONLY,
    CURRENT_ROUTES.RADMIN,
    REDUNDANCY_STATES.RADMIN_CONNECTED,
  )
  check('T5-03 kind', v.kind, 'radmin-only')
  check('T5-03 label', v.label, 'Radmin VPN')
  check('T5-03 sem fallback', v.fallback, false)
  check('T5-03 não radmin-fallback', v.kind === 'radmin-fallback', false)
}

// T5-04 PRIMARY_ONLY + PRIMARY → Cloudflare
{
  const v = resolveChipView(
    CLOUDFLARE_ROUTE,
    REDUNDANCY_MODES.PRIMARY_ONLY,
    CURRENT_ROUTES.PRIMARY,
    REDUNDANCY_STATES.PRIMARY_CONNECTED,
  )
  check('T5-04 kind', v.kind, 'primary')
  check('T5-04 label', v.label, 'Cloudflare Tunnel')
}

// T5-05 PPR + NONE → rota diferente; não PRIMARY, não Radmin
{
  const v = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.NONE,
    REDUNDANCY_STATES.IDLE,
  )
  check('T5-05 kind', v.kind, 'unknown')
  check('T5-05 stateKey', v.stateKey, 'CONNGUARD.Chip.DifferentRoute')
  check('T5-05 não primary', v.kind === 'primary', false)
  check('T5-05 não radmin', v.kind === 'radmin-fallback', false)
}

// T5-06 ACTIVE_ROUTE permanece Playit depois do failover; chip mostra Radmin (Fallback)
{
  const before = PLAYIT_ROUTE.label
  const v = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.RADMIN,
    REDUNDANCY_STATES.RADMIN_CONNECTED,
  )
  check('T5-06 kind', v.kind, 'radmin-fallback')
  check('T5-06 ACTIVE_ROUTE inalterado', PLAYIT_ROUTE.label, before)
}

// T5-07 nova inicialização já pelo IP Radmin → chip mostra Radmin (Fallback)
{
  const v = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.RADMIN,
    REDUNDANCY_STATES.RADMIN_CONNECTED,
  )
  check('T5-07 kind', v.kind, 'radmin-fallback')
  check('T5-07 labelKey', v.labelKey, 'CONNGUARD.Chip.RadminFallback')
}

// T5-08 PRIMARY volta enquanto cliente está no Radmin → continua Radmin (Fallback)
{
  const v = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.RADMIN,
    REDUNDANCY_STATES.RADMIN_CONNECTED,
  )
  check('T5-08 kind', v.kind, 'radmin-fallback')
  check('T5-08 sem failback (não primary)', v.kind === 'primary', false)
}

// Extras: estados transitórios (retrying / failover)
{
  const vRetrying = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.PRIMARY,
    REDUNDANCY_STATES.PRIMARY_RETRYING,
  )
  check('T5 retrying kind', vRetrying.kind, 'retrying')
  check('T5 retrying stateKey', vRetrying.stateKey, 'CONNGUARD.Chip.Reconnecting')

  const vFailover = resolveChipView(
    PLAYIT_ROUTE,
    REDUNDANCY_MODES.PRIMARY_PLUS_RADMIN,
    CURRENT_ROUTES.PRIMARY,
    REDUNDANCY_STATES.RADMIN_FAILOVER,
  )
  check('T5 failover kind', vFailover.kind, 'failover')
  check('T5 failover stateKey', vFailover.stateKey, 'CONNGUARD.Chip.Switching')
}

// =====================================================================
// Tarefa 6 — Radmin Fallback Readiness
// =====================================================================

// T6-01 porta 30000 → comando usa 30000
{
  const cmd = buildHostFirewallCommand(30000)
  check('T6-01 New-NetFirewallRule', cmd.includes('New-NetFirewallRule'), true)
  check('T6-01 LocalPort 30000', cmd.includes('-LocalPort 30000'), true)
  check('T6-01 DisplayName 30000', cmd.includes('"Foundry VTT - Radmin TCP 30000"'), true)
}

// T6-02 outra porta → comando usa a outra porta
{
  const cmd = buildHostFirewallCommand('8080')
  check('T6-02 LocalPort 8080', cmd.includes('-LocalPort 8080'), true)
  check('T6-02 DisplayName 8080', cmd.includes('"Foundry VTT - Radmin TCP 8080"'), true)
  check('T6-02 inválido → null', buildHostFirewallCommand(99999), null)
}

// T6-03 nenhum IP específico aparece no comando
{
  const cmd = buildHostFirewallCommand(30000)
  check('T6-03 sem IPv4', /\d{1,3}(\.\d{1,3}){3}/.test(cmd), false)
  check('T6-03 sem prefixo 26.', cmd.includes('26.'), false)
}

// T6-04 Open Radmin Test usa a radminUrl configurada
{
  const html = renderReadinessHtml({ enabled: true, radminUrl: 'http://26.10.20.30:30000' })
  check('T6-04 href = radminUrl', html.includes('href="http://26.10.20.30:30000"'), true)
  check('T6-04 mostra host', html.includes('http://26.10.20.30:30000'), true)
  check('T6-04 mostra porta', html.includes('30000'), true)
}

// T6-05 fallback disabled → readiness não apresentado como ativo
{
  check('T6-05 sem url → vazio', renderReadinessHtml({ enabled: false, radminUrl: '' }), '')
  check(
    'T6-05 com url mas disabled → vazio',
    renderReadinessHtml({ enabled: false, radminUrl: 'http://26.10.20.30:30000' }),
    '',
  )
}

// T6-06 fallback enabled → Not Verified antes da validação
{
  const html = renderReadinessHtml({
    enabled: true,
    radminUrl: 'http://26.10.20.30:30000',
    validated: false,
  })
  check('T6-06 Not Verified', html.includes('CONNGUARD.ServiceWizard.RadminNotVerified'), true)
  check('T6-06 não Verified', html.includes('CONNGUARD.ServiceWizard.RadminVerified'), false)

  const verified = renderReadinessHtml({
    enabled: true,
    radminUrl: 'http://26.10.20.30:30000',
    validated: true,
  })
  check(
    'T6-06 Verified após validar',
    verified.includes('CONNGUARD.ServiceWizard.RadminVerified'),
    true,
  )
}

// T6-07 nenhum código executa PowerShell automaticamente (scan estático)
{
  const files = ['radmin-readiness.js', 'service-wizard.js', 'route-redundancy-manager.js']
  const forbidden = [
    'child_process',
    '.spawn(',
    'execSync',
    'execFile',
    'powershell.exe',
    'Start-Process',
  ]
  for (const file of files) {
    const src = readFileSync(path.join(SCRIPTS_DIR, file), 'utf8')
    for (const pattern of forbidden) {
      check(`T6-07 ${file} sem ${pattern}`, src.includes(pattern), false)
    }
  }
}

// T6-08 nenhum IP/nome do ambiente do desenvolvedor hardcoded
{
  const readinessSrc = readFileSync(path.join(SCRIPTS_DIR, 'radmin-readiness.js'), 'utf8')
  const wizardSrc = readFileSync(path.join(SCRIPTS_DIR, 'service-wizard.js'), 'utf8')
  check('T6-08 sem IP dev (readiness)', readinessSrc.includes('26.10.20.30'), false)
  check('T6-08 sem nome dev (readiness)', readinessSrc.includes('softmisst'), false)
  check('T6-08 sem IP dev (wizard)', wizardSrc.includes('26.10.20.30'), false)
  const cmd = buildHostFirewallCommand(30000)
  check('T6-08 comando sem IPv4', /\d{1,3}(\.\d{1,3}){3}/.test(cmd), false)
}

// Extras: extractRadminPort + safeParse (validated)
{
  check('T6 extract port 30000', extractRadminPort('http://26.10.20.30:30000'), '30000')
  check('T6 extract port default http', extractRadminPort('http://26.10.20.30'), '80')
  check('T6 extract port inválido', extractRadminPort('not-a-url'), null)
  const parsed = safeParseReadiness(
    '{"enabled":true,"radminUrl":"http://26.10.20.30:30000","validated":true}',
  )
  check('T6 safeParse validated', parsed.validated, true)
  check('T6 safeParse corrupt', safeParseReadiness('{corrupt').validated, false)
}

console.log(report.join('\n'))
console.log(`\nResultado: ${checks} verificações, ${failures} falha(s)`)
process.exit(failures ? 1 : 0)
