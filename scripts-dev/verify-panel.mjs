// Verificação do veredito do painel do GM — função pura, roda fora do Foundry.
import { resolveConnectionVerdict, VERDICT_LEVELS } from '../scripts/panel-verdict.js'

let checks = 0
let failures = 0
const report = []

function check(label, actual, expected) {
  checks += 1
  const ok = Object.is(actual, expected)
  if (!ok) failures += 1
  report.push(`${ok ? 'PASS' : 'FAIL'} | ${label} | esperado=${expected} obtido=${actual}`)
}

const good = (average = 40) => ({ hasData: true, stale: false, average })

// PANEL-01 estados básicos
check('PANEL-01 lista vazia → ok', resolveConnectionVerdict([], 0, 300).level, VERDICT_LEVELS.OK)
check(
  'PANEL-01 todos bons → ok',
  resolveConnectionVerdict([good(), good(80)], 0, 300).level,
  VERDICT_LEVELS.OK,
)
check(
  'PANEL-01 stale → problem',
  resolveConnectionVerdict([good(), { hasData: true, stale: true, average: 40 }], 0, 300).level,
  VERDICT_LEVELS.PROBLEM,
)
check(
  'PANEL-01 média alta → attention',
  resolveConnectionVerdict([good(400)], 0, 300).level,
  VERDICT_LEVELS.ATTENTION,
)
check(
  'PANEL-01 alertas → attention',
  resolveConnectionVerdict([good()], 2, 300).level,
  VERDICT_LEVELS.ATTENTION,
)

// PANEL-02 precedência e bordas
check(
  'PANEL-02 problem vence attention',
  resolveConnectionVerdict([{ hasData: true, stale: true, average: 900 }, good(900)], 5, 300).level,
  VERDICT_LEVELS.PROBLEM,
)
check(
  'PANEL-02 média == limiar → ok (não é >)',
  resolveConnectionVerdict([good(300)], 0, 300).level,
  VERDICT_LEVELS.OK,
)
check(
  'PANEL-02 média 301 → attention',
  resolveConnectionVerdict([good(301)], 0, 300).level,
  VERDICT_LEVELS.ATTENTION,
)

// PANEL-03 contagens
{
  const verdict = resolveConnectionVerdict(
    [good(), { hasData: true, stale: true, average: null }, { hasData: false }, good(500)],
    1,
    300,
  )
  check('PANEL-03 total', verdict.counts.total, 4)
  check('PANEL-03 stale', verdict.counts.stale, 1)
  check('PANEL-03 high', verdict.counts.high, 1)
  check('PANEL-03 noData', verdict.counts.noData, 1)
  check('PANEL-03 alerts', verdict.counts.alerts, 1)
  check('PANEL-03 level', verdict.level, VERDICT_LEVELS.PROBLEM)
}

// PANEL-04 entradas defensivas
check('PANEL-04 null rows → ok', resolveConnectionVerdict(null, 0, 300).level, VERDICT_LEVELS.OK)
check('PANEL-04 não-array → ok', resolveConnectionVerdict('nope', 0, 300).level, VERDICT_LEVELS.OK)
check(
  'PANEL-04 linhas nulas ignoradas',
  resolveConnectionVerdict([null, undefined, good()], 0, 300).counts.total,
  3,
)
check(
  'PANEL-04 limiar inválido usa 300',
  resolveConnectionVerdict([good(301)], 0, 'x').level,
  VERDICT_LEVELS.ATTENTION,
)
check(
  'PANEL-04 sem dados → ok + noData',
  resolveConnectionVerdict([{ hasData: false }], 0, 300).counts.noData,
  1,
)
check(
  'PANEL-04 média não-numérica não conta como high',
  resolveConnectionVerdict([{ hasData: true, stale: false, average: 'x' }], 0, 300).level,
  VERDICT_LEVELS.OK,
)

console.log(report.join('\n'))
console.log(`\nResultado: ${checks} verificações, ${failures} falha(s)`)
process.exit(failures ? 1 : 0)
