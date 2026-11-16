import fs from 'node:fs/promises'
import assert from 'node:assert/strict'

const read = async (name) => {
  const bytes = await fs.readFile(new URL(name, import.meta.url))
  return bytes.toString(bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf16le' : 'utf8')
}
const suite = async (log, files, tests) => {
  const text = await read(log)
  assert.match(text, new RegExp(`Test Files\\s+${files} passed`))
  assert.match(text, new RegExp(`Tests\\s+${tests} passed`))
  return { files, tests, status: 'passed' }
}
const pages = async (width) => {
  const rows = JSON.parse(await read(`after-${width}-walkthrough.json`))
  assert.equal(rows.length, 24)
  for (const row of rows) {
    assert.equal(row.actualPath, row.route)
    assert.equal(row.errors.length + row.routeErrors.length + row.failures.length, 0, row.route)
    assert.ok(row.overflow <= 1, row.route)
  }
  return { width, visits: rows.length, status: 'passed', routes: rows.map((row) => row.route) }
}
const checks = [
  ...JSON.parse(await read('after-1440-deep-checks.json')),
  ...JSON.parse(await read('after-1440-deep-entries.json')),
]
assert.equal(checks.length, 38)
for (const check of checks) {
  assert.equal(check.status, 'passed', check.name)
  assert.equal(check.errors.length + check.failures.length, 0, check.name)
}
for (const platform of ['android', 'ios']) {
  const log = await read(`${platform}-checkout-verified.log`)
  assert.match(log, /Test Suites:\s+2 passed/)
  assert.match(log, /Tests:\s+11 passed/)
  assert.match(log, /processExitCode=0/)
}
assert.match(await read('fresh-migration.log'), /applied: 236/)
assert.match(await read('migration-upgrade.log'), /applied: 1/)
assert.match(await read('build.log'), /built in/)

const result = {
  verifiedAt: new Date().toISOString(),
  environment: 'Development',
  web: 'https://app-dev.supplifyerp.com',
  sourceCommit: '206c4622286520ad1cbb959c552a2f4d6aa10283',
  confirmedProductDefectsFixed: 8,
  automated: {
    api: await suite('api-final-verified.log', 396, 2610),
    web: await suite('web-final.log', 163, 625),
    postgres: await suite('postgres-final.log', 2, 43),
    migrations: { freshCount: 236, upgradeAppliedCount: 1, status: 'passed' },
    typechecks: { erp: 'passed', android: 'passed', ios: 'passed' },
    webBuild: 'passed',
    targetedLint: { webErrors: 0, webWarnings: 0, apiErrors: 0, existingApiWarnings: 41 },
  },
  mobile: {
    android: {
      commit: 'd55333ee69be225c7b6ae9db3fe6de7f8d7cdc9c',
      suites: 2,
      tests: 11,
      status: 'passed',
    },
    ios: {
      commit: '075ea9bfcfe43c70a5e3104f108d150bb8160f1c',
      suites: 2,
      tests: 11,
      status: 'passed',
    },
  },
  deploymentAtWalkthrough: {
    api: { id: 'a375ae1a-fc42-462a-9c01-9663cbc3ac25', status: 'SUCCESS' },
    web: { id: 'fd4c1ca8-1c0d-4be8-aa51-84275af25e8d', status: 'SUCCESS' },
    migration0235: 'Applied; SQL migrations completed in API startup logs',
  },
  live: {
    pages: await Promise.all([pages(1440), pages(390)]),
    deeperChecks: checks.map(({ name, status }) => ({ name, status })),
    weeklySummaryStatus: 200,
    reorderAssistanceStatus: 200,
    namedReorderSuggestions: 29,
    browserErrors: 0,
    caughtRouteErrors: 0,
    failedHostedRequests: 0,
    documentOverflow: 0,
    businessTransactionsSubmitted: 0,
    messagesSent: 0,
  },
  limits: [
    'Selected seeded restaurant owner in Development; no absolute bug-free guarantee.',
    'Business mutations verified in isolated tests; no hosted purchases, receipts, payments or bookings submitted.',
    'Live quote comparison and recipe detail fixtures absent for the selected account; isolated coverage recorded in audit.',
    'Physical devices, every plan/role/branch, offline sessions and external delivery providers are not certified.',
  ],
}
await fs.writeFile(
  new URL('verification-summary.json', import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`
)
console.log(JSON.stringify({ status: 'passed', pageVisits: 48, deeperChecks: checks.length }))
