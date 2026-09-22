// Verificação do World Gate — roda fora do Foundry.
// Funções puras são testadas diretamente; o WorldGate é instanciado com
// `game`/`document`/`Hooks` mockados (fake timers para o redirect).
import {
  GATE_STATES,
  gateStateFromSetting,
  shouldEjectSelf,
  collectRoleBackup,
  parseRolesBackup,
  resolveRestoreUpdates,
  resolveBanUpdates,
  WorldGate,
} from '../scripts/world-gate.js'
import { SETTINGS, SOCKET_MESSAGES } from '../scripts/constants.js'

let checks = 0
let failures = 0
const report = []

function check(label, actual, expected) {
  checks += 1
  const ok = Object.is(actual, expected)
  if (!ok) failures += 1
  report.push(`${ok ? 'PASS' : 'FAIL'} | ${label} | esperado=${expected} obtido=${actual}`)
}

// ---------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------

// GATE-01 gateStateFromSetting
check('GATE-01 true → CLOSED', gateStateFromSetting(true), GATE_STATES.CLOSED)
check('GATE-01 false → OPEN', gateStateFromSetting(false), GATE_STATES.OPEN)
check('GATE-01 null → OPEN', gateStateFromSetting(null), GATE_STATES.OPEN)
check('GATE-01 undefined → OPEN', gateStateFromSetting(undefined), GATE_STATES.OPEN)

// GATE-02 shouldEjectSelf
check('GATE-02 GM + locked → false', shouldEjectSelf(true, true), false)
check('GATE-02 GM + open → false', shouldEjectSelf(true, false), false)
check('GATE-02 player + locked → true', shouldEjectSelf(false, true), true)
check('GATE-02 player + open → false', shouldEjectSelf(false, false), false)

// GATE-03 collectRoleBackup
{
  const users = [
    { id: 'gm', role: 4, isGM: true },
    { id: 'p1', role: 1, isGM: false },
    { id: 'p2', role: 2, isGM: false },
    { id: 'p3', role: 0, isGM: false },
  ]
  const backup = collectRoleBackup(users)
  check('GATE-03 tamanho', backup.length, 3)
  check('GATE-03 gm fora', backup.some(u => u.id === 'gm'), false)
  check('GATE-03 p1 role', backup.find(u => u.id === 'p1')?.role, 1)
  check('GATE-03 p3 role 0 preservado', backup.find(u => u.id === 'p3')?.role, 0)
  check('GATE-03 usuário sem id ignorado', collectRoleBackup([{ role: 1 }]).length, 0)
  check('GATE-03 null não crasga', collectRoleBackup(null).length, 0)
}

// GATE-04 parseRolesBackup
check('GATE-04 JSON válido', parseRolesBackup('[{"id":"p1","role":1}]').length, 1)
check('GATE-04 JSON inválido', parseRolesBackup('{nope').length, 0)
check('GATE-04 vazio', parseRolesBackup('').length, 0)
check('GATE-04 null', parseRolesBackup(null).length, 0)
check(
  'GATE-04 não-array ignorado',
  parseRolesBackup('{"id":"p1"}').length,
  0,
)
check(
  'GATE-04 entrada sem id descartada',
  parseRolesBackup('[{"role":1}]').length,
  0,
)
check(
  'GATE-04 role inválida descartada',
  parseRolesBackup('[{"id":"p1","role":"x"}]').length,
  0,
)
check(
  'GATE-04 role numérica string aceita',
  parseRolesBackup('[{"id":"p1","role":"2"}]')[0]?.role,
  2,
)

// GATE-05 resolveRestoreUpdates
{
  const users = [
    { id: 'gm', role: 4, isGM: true },
    { id: 'p1', role: 0, isGM: false },
    { id: 'p2', role: 1, isGM: false },
    { id: 'p3', role: 0, isGM: false },
  ]
  const backup = [
    { id: 'p1', role: 1 },
    { id: 'p2', role: 2 },
    { id: 'p3', role: 2 },
  ]
  const updates = resolveRestoreUpdates(users, backup)
  check('GATE-05 restaura só quem está em NONE', updates.length, 2)
  check('GATE-05 p1→1', updates.find(u => u._id === 'p1')?.role, 1)
  check('GATE-05 p3→2', updates.find(u => u._id === 'p3')?.role, 2)
  check('GATE-05 p2 não-banido intocado', updates.some(u => u._id === 'p2'), false)
  check('GATE-05 gm nunca restaurado', updates.some(u => u._id === 'gm'), false)
  check('GATE-05 sem backup → vazio', resolveRestoreUpdates(users, []).length, 0)
  check('GATE-05 backup sem entrada → vazio', resolveRestoreUpdates(users, null).length, 0)
}

// GATE-06 resolveBanUpdates
{
  const users = [
    { id: 'gm', role: 4, isGM: true },
    { id: 'p1', role: 1, isGM: false },
    { id: 'p2', role: 0, isGM: false },
  ]
  const updates = resolveBanUpdates(users)
  check('GATE-06 ban 1 (p2 já NONE pula)', updates.length, 1)
  check('GATE-06 p1→NONE', updates[0]?._id, 'p1')
  check('GATE-06 p1 role 0', updates[0]?.role, 0)
}

// ---------------------------------------------------------------------
// WorldGate com mocks (fake timers para o redirect)
// ---------------------------------------------------------------------

const ORIGINAL_TIMERS = {
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

let teardownHandlers = []

function gateTeardown() {
  for (const fn of teardownHandlers) fn()
  teardownHandlers = []
  globalThis.setTimeout = ORIGINAL_TIMERS.setTimeout
  globalThis.clearTimeout = ORIGINAL_TIMERS.clearTimeout
  delete globalThis.game
  delete globalThis.document
  delete globalThis.location
  delete globalThis.Hooks
  delete globalThis.ui
  delete globalThis.foundry
}

function gateSetup({
  isGM = true,
  locked = false,
  users = [],
  settings = {},
  locationOrigin = 'http://localhost:30000',
  onSocketEmit = null,
}) {
  const fakeTimers = makeFakeTimers()
  const store = { ...settings }
  const hookCalls = []
  const appended = []
  const socketEvents = {}

  globalThis.location = { origin: locationOrigin, href: `${locationOrigin}/game` }

  globalThis.Hooks = {
    on: (name, fn) => {
      hookCalls.push({ name, fn })
      return hookCalls.length
    },
    off: () => {},
  }

  globalThis.ui = { notifications: { warn: () => {}, info: () => {} } }

  globalThis.document = {
    body: {
      appendChild: el => {
        appended.push(el)
      },
    },
    createElement: tag => ({
      tagName: tag.toUpperCase(),
      type: '',
      id: '',
      className: '',
      title: '',
      innerHTML: '',
      textContent: '',
      style: {},
      addEventListener: () => {},
      remove: () => {},
      classList: {
        _set: new Set(),
        toggle: function (cls, on) {
          if (on) this._set.add(cls)
          else this._set.delete(cls)
        },
        contains: function (cls) {
          return this._set.has(cls)
        },
      },
      append: (...children) => {
        for (const c of children) appended.push(c)
      },
    }),
  }

  globalThis.game = {
    user: { id: 'gm', isGM },
    users: {
      [Symbol.iterator]() {
        return users[Symbol.iterator]()
      },
    },
    settings: {
      get: (mid, key) => store[key],
      set: async (mid, key, value) => {
        store[key] = value
      },
    },
    socket: {
      on: (evt, fn) => {
        socketEvents[evt] = fn
      },
      off: (evt, fn) => {
        if (socketEvents[evt] === fn) delete socketEvents[evt]
      },
      emit: (evt, payload) => {
        if (onSocketEmit) onSocketEmit(evt, payload)
      },
    },
    i18n: {
      localize: key => `[${key}]`,
    },
    data: { routePrefix: '' },
  }

  const UserUpdateCalls = []
  globalThis.User = {
    updateDocuments: async updates => {
      UserUpdateCalls.push(...updates)
    },
  }

  teardownHandlers.push(() => {})

  return {
    fakeTimers,
    hookCalls,
    appended,
    store,
    socketEvents,
    UserUpdateCalls,
    game: globalThis.game,
  }
}

// GATE-07 GM com mesa aberta → botão renderizado, sem overlay, sem redirect
{
  const env = gateSetup({ isGM: true, locked: false })
  const gate = new WorldGate()
  gate.start()
  check('GATE-07 botão criado', env.appended.some(el => el.className === 'connguard-world-gate-button'), true)
  check('GATE-07 sem overlay', env.appended.some(el => el.className === 'connguard-gate-overlay'), false)
  check('GATE-07 timers 0', env.fakeTimers.active().length, 0)
  check('GATE-07 state OPEN', gate.state, GATE_STATES.OPEN)
  gateTeardown()
}

// GATE-08 Player com mesa fechada no ready → overlay + 1 timer de redirect
{
  const env = gateSetup({
    isGM: false,
    locked: true,
    settings: { [SETTINGS.GATE_LOCKED]: true },
  })
  const gate = new WorldGate()
  gate.start()
  check('GATE-08 overlay criado', env.appended.some(el => el.className === 'connguard-gate-overlay'), true)
  check('GATE-08 timer de redirect', env.fakeTimers.active().length, 1)
  check('GATE-08 state CLOSED', gate.state, GATE_STATES.CLOSED)
  gateTeardown()
}

// GATE-09 Player com mesa aberta → sem overlay
{
  const env = gateSetup({ isGM: false, locked: false })
  const gate = new WorldGate()
  gate.start()
  check('GATE-09 sem overlay', env.appended.some(el => el.className === 'connguard-gate-overlay'), false)
  check('GATE-09 timers 0', env.fakeTimers.active().length, 0)
  gateTeardown()
}

// GATE-10 redirect do player usa location.href após o timer
{
  const env = gateSetup({ isGM: false, locked: true, settings: { [SETTINGS.GATE_LOCKED]: true } })
  const gate = new WorldGate()
  gate.start()
  const timer = env.fakeTimers.active()[0]
  env.fakeTimers.fire(timer.id)
  check('GATE-10 href redirecionado', globalThis.location.href, 'http://localhost:30000')
  check('GATE-10 redirect só 1x', env.fakeTimers.active().length, 0)
  gateTeardown()
}

// GATE-11 GM #lock() → backup salvo, roles banidas, GATE_LOCKED true, socket emit
async function testLock() {
  const emits = []
  const env = gateSetup({
    isGM: true,
    locked: false,
    users: [
      { id: 'gm', role: 4, isGM: true },
      { id: 'p1', role: 1, isGM: false },
      { id: 'p2', role: 2, isGM: false },
    ],
    onSocketEmit: (evt, payload) => emits.push(payload),
  })
  const gate = new WorldGate()
  gate.start()
  await gate.toggle()

  const backup = JSON.parse(env.store[SETTINGS.GATE_ROLES_BACKUP] || '[]')
  check('GATE-11 backup 2 players', backup.length, 2)
  check('GATE-11 gm fora do backup', backup.some(u => u.id === 'gm'), false)
  check('GATE-11 p1 banido', env.UserUpdateCalls.some(u => u._id === 'p1' && u.role === 0), true)
  check('GATE-11 p2 banido', env.UserUpdateCalls.some(u => u._id === 'p2' && u.role === 0), true)
  check('GATE-11 GATE_LOCKED true', env.store[SETTINGS.GATE_LOCKED], true)
  check('GATE-11 socket emit locked', emits.some(e => e.type === SOCKET_MESSAGES.GATE_CHANGED && e.locked === true), true)
  gateTeardown()
}

// GATE-12 GM #unlock() → roles restauradas, GATE_LOCKED false, socket emit
async function testUnlock() {
  const emits = []
  const env = gateSetup({
    isGM: true,
    locked: true,
    users: [
      { id: 'gm', role: 4, isGM: true },
      { id: 'p1', role: 0, isGM: false },
      { id: 'p2', role: 0, isGM: false },
    ],
    settings: {
      [SETTINGS.GATE_LOCKED]: true,
      [SETTINGS.GATE_ROLES_BACKUP]: JSON.stringify([
        { id: 'p1', role: 1 },
        { id: 'p2', role: 2 },
      ]),
    },
    onSocketEmit: (evt, payload) => emits.push(payload),
  })
  const gate = new WorldGate()
  gate.start()
  await gate.toggle()

  check('GATE-12 p1 restaurado 1', env.UserUpdateCalls.some(u => u._id === 'p1' && u.role === 1), true)
  check('GATE-12 p2 restaurado 2', env.UserUpdateCalls.some(u => u._id === 'p2' && u.role === 2), true)
  check('GATE-12 backup limpo', env.store[SETTINGS.GATE_ROLES_BACKUP], '')
  check('GATE-12 GATE_LOCKED false', env.store[SETTINGS.GATE_LOCKED], false)
  check('GATE-12 socket emit open', emits.some(e => e.type === SOCKET_MESSAGES.GATE_CHANGED && e.locked === false), true)
  gateTeardown()
}

// GATE-13 #unlock() não sobrescreve role manual do GM durante bloqueio
async function testManualRole() {
  const env = gateSetup({
    isGM: true,
    locked: true,
    users: [
      { id: 'gm', role: 4, isGM: true },
      { id: 'p1', role: 1, isGM: false },
      { id: 'p2', role: 0, isGM: false },
    ],
    settings: {
      [SETTINGS.GATE_LOCKED]: true,
      [SETTINGS.GATE_ROLES_BACKUP]: JSON.stringify([
        { id: 'p1', role: 1 },
        { id: 'p2', role: 2 },
      ]),
    },
  })
  const gate = new WorldGate()
  gate.start()
  await gate.toggle()

  check('GATE-13 p1 (role 1) não tocado', env.UserUpdateCalls.some(u => u._id === 'p1'), false)
  check('GATE-13 p2 (role 0) restaurado', env.UserUpdateCalls.some(u => u._id === 'p2' && u.role === 2), true)
  gateTeardown()
}

// GATE-14 stop() limpa recursos (sem erro em stop duplo)
{
  const env = gateSetup({ isGM: true, locked: false })
  const gate = new WorldGate()
  gate.start()
  gate.stop()
  gate.stop()
  check('GATE-14 stop duplo sem erro', true, true)
  gateTeardown()
}

await testLock()
await testUnlock()
await testManualRole()

console.log(report.join('\n'))
console.log(`\nResultado: ${checks} verificações, ${failures} falha(s)`)
process.exit(failures ? 1 : 0)