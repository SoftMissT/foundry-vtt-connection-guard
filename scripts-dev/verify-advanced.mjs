// Verificação do painel Avançado — roda fora do Foundry.
// Metadados e sanitização são testados direto; o fluxo de gravação usa
// game/foundry/ui mockados (mesmo padrão do verify-gate.mjs).
import {
  ADVANCED_SETTINGS,
  sanitizeAdvancedValue,
  buildAdvancedFormHtml,
  openAdvancedSettings,
} from '../scripts/advanced-settings.js'
import { SETTINGS } from '../scripts/constants.js'

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
// ADV-01 metadados
// ---------------------------------------------------------------------

check('ADV-01 total de campos', ADVANCED_SETTINGS.length, 7)
check(
  'ADV-01 chaves únicas',
  new Set(ADVANCED_SETTINGS.map(d => d.key)).size,
  ADVANCED_SETTINGS.length,
)

for (const def of ADVANCED_SETTINGS) {
  check(`ADV-01 ${def.key} escopo válido`, ['world', 'client'].includes(def.scope), true)
  check(`ADV-01 ${def.key} min<max`, def.min < def.max, true)
  check(`ADV-01 ${def.key} passo>0`, def.step > 0, true)
  check(`ADV-01 ${def.key} min alinhado ao passo`, def.min % def.step, 0)
  check(
    `ADV-01 ${def.key} padrão dentro da faixa`,
    def.default >= def.min && def.default <= def.max,
    true,
  )
}

check(
  'ADV-01 intervalo coberto',
  ADVANCED_SETTINGS.some(d => d.key === SETTINGS.LATENCY_INTERVAL && d.scope === 'world'),
  true,
)
check(
  'ADV-01 failover coberto',
  ADVANCED_SETTINGS.some(d => d.key === SETTINGS.FAILOVER_TIMEOUT),
  true,
)
check(
  'ADV-01 reconexão é client-scope',
  ADVANCED_SETTINGS.some(d => d.key === SETTINGS.RECONNECT_MAX_DELAY && d.scope === 'client'),
  true,
)

// ---------------------------------------------------------------------
// ADV-02 sanitizeAdvancedValue (intervalo: 10..90, passo 5, padrão 20)
// ---------------------------------------------------------------------

const interval = ADVANCED_SETTINGS.find(d => d.key === SETTINGS.LATENCY_INTERVAL)
const cycles = ADVANCED_SETTINGS.find(d => d.key === SETTINGS.DEGRADATION_CYCLES)

check('ADV-02 vazio → padrão', sanitizeAdvancedValue(interval, ''), 20)
check('ADV-02 espaços → padrão', sanitizeAdvancedValue(interval, '   '), 20)
check('ADV-02 null → padrão', sanitizeAdvancedValue(interval, null), 20)
check('ADV-02 undefined → padrão', sanitizeAdvancedValue(interval, undefined), 20)
check('ADV-02 texto → padrão', sanitizeAdvancedValue(interval, 'x'), 20)
check('ADV-02 NaN → padrão', sanitizeAdvancedValue(interval, NaN), 20)
check('ADV-02 Infinity → padrão', sanitizeAdvancedValue(interval, Infinity), 20)
check('ADV-02 objeto → padrão', sanitizeAdvancedValue(interval, {}), 20)
check('ADV-02 abaixo do min clampa', sanitizeAdvancedValue(interval, 5), 10)
check('ADV-02 acima do max clampa', sanitizeAdvancedValue(interval, 500), 90)
check('ADV-02 17 alinha para 15', sanitizeAdvancedValue(interval, 17), 15)
check('ADV-02 88 alinha para 90', sanitizeAdvancedValue(interval, 88), 90)
check('ADV-02 string numérica aceita', sanitizeAdvancedValue(interval, '43'), 45)
check('ADV-02 decimal alinha no passo', sanitizeAdvancedValue(cycles, 7.6), 8)
check('ADV-02 decimal abaixo do min clampa', sanitizeAdvancedValue(cycles, 0.2), 2)

// ---------------------------------------------------------------------
// ADV-03 HTML do formulário
// ---------------------------------------------------------------------

const stubT = key => key
const html = buildAdvancedFormHtml(
  Object.fromEntries(ADVANCED_SETTINGS.map(d => [d.key, d.default])),
  stubT,
)

for (const def of ADVANCED_SETTINGS) {
  check(`ADV-03 campo ${def.key} presente`, html.includes(`name="${def.key}"`), true)
  check(`ADV-03 campo ${def.key} numérico`, html.includes(`id="connection-guard-adv-${def.key}"`), true)
  check(`ADV-03 campo ${def.key} min`, html.includes(`min="${def.min}"`), true)
  check(`ADV-03 campo ${def.key} max`, html.includes(`max="${def.max}"`), true)
  check(`ADV-03 campo ${def.key} value padrão`, html.includes(`value="${def.default}"`), true)
}
check('ADV-03 seção "toda a mesa"', html.includes('CONNGUARD.Advanced.SectionWorld'), true)
check('ADV-03 seção "só para você"', html.includes('CONNGUARD.Advanced.SectionClient'), true)
check('ADV-03 intro presente', html.includes('CONNGUARD.Advanced.Intro'), true)

// ---------------------------------------------------------------------
// ADV-04..07 fluxo de gravação (mocks)
// ---------------------------------------------------------------------

function advSetup({ isGM = true, dialogResult = null, failOnSet = null } = {}) {
  const store = {}
  for (const def of ADVANCED_SETTINGS) store[def.key] = def.default

  const setCalls = []
  const warnCalls = []
  const infoCalls = []
  const errorCalls = []
  const dialogCalls = []
  const consoleWarns = []

  const originalWarn = console.warn
  console.warn = (...args) => consoleWarns.push(args)
  advTeardownHandlers.push(() => {
    console.warn = originalWarn
  })

  globalThis.game = {
    user: { isGM },
    settings: {
      get: (mid, key) => store[key],
      set: async (mid, key, value) => {
        if (failOnSet && failOnSet(key, value)) throw new Error('mock: falha forçada')
        setCalls.push({ key, value })
        store[key] = value
      },
    },
    i18n: {
      localize: key => `[${key}]`,
      format: (key, data) => `[${key}:${JSON.stringify(data)}]`,
    },
  }

  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          input: async config => {
            dialogCalls.push(config)
            return dialogResult
          },
        },
      },
    },
  }

  globalThis.ui = {
    notifications: {
      warn: msg => warnCalls.push(msg),
      info: msg => infoCalls.push(msg),
      error: msg => errorCalls.push(msg),
    },
  }

  return { store, setCalls, warnCalls, infoCalls, errorCalls, dialogCalls, consoleWarns }
}

let advTeardownHandlers = []

function advTeardown() {
  for (const fn of advTeardownHandlers) fn()
  advTeardownHandlers = []
  delete globalThis.game
  delete globalThis.foundry
  delete globalThis.ui
}

// ADV-04 não-GM é recusado
async function testGmOnly() {
  const env = advSetup({ isGM: false })
  const result = await openAdvancedSettings()
  check('ADV-04 não-GM → null', result, null)
  check('ADV-04 não-GM sem diálogo', env.dialogCalls.length, 0)
  check('ADV-04 não-GM avisado', env.warnCalls.length, 1)
  advTeardown()
}

// ADV-05 cancelar não grava nada
async function testCancel() {
  const env = advSetup({ dialogResult: null })
  const result = await openAdvancedSettings()
  check('ADV-05 cancelar → null', result, null)
  check('ADV-05 cancelar sem escrita', env.setCalls.length, 0)
  advTeardown()
}

// ADV-06 valores fora da faixa são sanitizados e gravados
async function testApplySanitized() {
  const env = advSetup({
    dialogResult: {
      [SETTINGS.LATENCY_INTERVAL]: '500',
      [SETTINGS.RECONNECT_MAX_DELAY]: '1000',
    },
  })
  const changed = await openAdvancedSettings()
  check('ADV-06 duas mudanças', changed.length, 2)
  check(
    'ADV-06 intervalo clampado',
    env.setCalls.find(c => c.key === SETTINGS.LATENCY_INTERVAL)?.value,
    90,
  )
  check(
    'ADV-06 reconexão clampada',
    env.setCalls.find(c => c.key === SETTINGS.RECONNECT_MAX_DELAY)?.value,
    60,
  )
  check('ADV-06 notificação de salvo', env.infoCalls.length, 1)
  advTeardown()
}

// ADV-07 valores inalterados não geram escrita
async function testOnlyChanged() {
  const env = advSetup({ dialogResult: {} })
  const changed = await openAdvancedSettings()
  check('ADV-07 nada mudou', changed.length, 0)
  check('ADV-07 sem escritas', env.setCalls.length, 0)
  advTeardown()
}

// ADV-08 falha de escrita é avisada (não é engolida em silêncio)
async function testWriteFailure() {
  const env = advSetup({
    dialogResult: { [SETTINGS.LATENCY_INTERVAL]: 30 },
    failOnSet: () => true,
  })
  const result = await openAdvancedSettings()
  check('ADV-08 falha → null', result, null)
  check('ADV-08 erro notificado', env.errorCalls.length, 1)
  check('ADV-08 sem notificação de salvo', env.infoCalls.length, 0)
  advTeardown()
}

await testGmOnly()
await testCancel()
await testApplySanitized()
await testOnlyChanged()
await testWriteFailure()

console.log(report.join('\n'))
console.log(`\nResultado: ${checks} verificações, ${failures} falha(s)`)
process.exit(failures ? 1 : 0)
