import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { createServer, loadEnv } from 'vite'
import { FLAG, INLINE, PANEL, SUCCESS_EVENT } from '../src/experiment.js'
import { api, connect, eventsApi, experimentPath, origin } from './local-flagsmith.mjs'

const endpoint = '/api/demo/profile'
const auth = 'Bearer first-200-demo'
const help = 'This endpoint requires an Authorization header. Enter Bearer first-200-demo in the Authorization field and send the request again.'
const eventsEndpoint = eventsApi + 'v1/events'

function observe(page) {
  const received = []
  page.on('response', (response) => {
    if (response.url() !== eventsEndpoint || response.request().method() !== 'POST') return
    received.push({ status: response.status(), events: response.request().postDataJSON().events })
  })
  return received
}

function accepted(batches) {
  assert.ok(batches.every(({ status }) => status === 202), 'Flagsmith rejected an events batch')
  return batches.flatMap(({ events }) => events)
}

async function expectEvents(batches, count) {
  for (let attempt = 0; accepted(batches).length < count && attempt < 40; attempt++) await delay(100)
  const events = accepted(batches)
  assert.equal(events.length, count)
  return events
}

async function send(page, status) {
  const response = page.waitForResponse((result) => new URL(result.url()).pathname === endpoint)
  await page.getByRole('button', { name: 'Send request' }).click()
  const reply = await response
  assert.equal(reply.status(), status)
  const body = status === 401 ? { error: 'Unauthorized' } : { name: 'Demo Developer' }
  assert.deepEqual(await reply.json(), body)
  await page.getByText(status === 401 ? '401 Unauthorized' : '200 OK', { exact: true }).waitFor()
  assert.deepEqual(JSON.parse(await page.locator('pre').textContent()), body)
}

async function stamp(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('first-200:'))
    return JSON.parse(localStorage.getItem(key))
  })
}

async function outsideExperiment(browser, url) {
  const page = await browser.newPage()
  try {
    const batches = observe(page)
    const assignment = page.waitForResponse((result) => result.url().startsWith(api + 'identities/'))
    await page.goto(url)
    assert.equal((await assignment).status(), 200)
    assert.deepEqual(accepted(batches), [])
    await page.getByLabel('Authorization').fill(auth)
    await send(page, 200)
    assert.equal(await page.locator('aside').count(), 0)
    await delay(300)
    await expectEvents(batches, 0)
  } finally {
    await page.context().close()
  }
}

async function checkBrowser(browser, url, totals) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  try {
    const batches = observe(page)
    await page.goto(url)
    const field = page.getByLabel('Authorization')
    assert.equal(await field.inputValue(), '')
    await send(page, 401)
    const [exposure] = await expectEvents(batches, 1)
    const variant = exposure.value
    assert.ok(Object.hasOwn(totals, variant), 'Flagsmith must serve one of the two configured variants')
    assert.equal(exposure.event, '$flag_exposure')
    assert.equal(exposure.feature_name, FLAG)
    assert.equal(await page.locator('aside p').textContent(), help)
    assert.equal(await page.locator('aside').getAttribute('class'), variant === INLINE ? 'help help-inline' : 'help help-panel')
    const saved = await stamp(page)
    assert.equal(saved.id, exposure.identifier)
    assert.equal(saved.variant, variant)
    const firstOfVariant = totals[variant].exposures === 0
    const secondOfVariant = totals[variant].exposures === 1
    totals[variant].exposures++

    if (firstOfVariant) {
      await field.fill('Bearer wrong')
      await send(page, 401)
      assert.deepEqual(await stamp(page), saved)
      await page.reload()
      await page.getByRole('heading', { name: 'Troubleshooting' }).waitFor()
      assert.deepEqual(await stamp(page), saved)

      await field.fill('  ' + auth + '  ')
      await send(page, 200)
      const [, conversion] = await expectEvents(batches, 2)
      assert.equal(conversion.event, SUCCESS_EVENT)
      assert.equal(conversion.identifier, exposure.identifier)
      totals[variant].successes++
      await send(page, 200)
    }

    if (secondOfVariant) {
      await page.clock.setFixedTime(saved.exposedAt + 50_000)
      await page.reload()
      await page.getByRole('heading', { name: 'Troubleshooting' }).waitFor()
      assert.deepEqual(await stamp(page), saved)
      await page.clock.setFixedTime(saved.exposedAt + 65_000)
      await field.fill(auth)
      await send(page, 200)
    }

    await delay(200)
    await expectEvents(batches, firstOfVariant ? 2 : 1)
  } finally {
    await page.context().close()
  }
}

async function refreshResults(sendApi, qa, batch, baseline) {
  const path = experimentPath(qa.environment, qa.experiment) + 'results/'
  try {
    await sendApi(path + 'refresh/', {})
  } catch (error) {
    if (error.status !== 429) throw error
    console.log('Flagsmith is limiting refreshes. The browser and event checks passed. Refresh the dashboard after its cooldown.')
    return null
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const { results } = await sendApi(path)
    const variants = results?.payload?.metrics.find((metric) => metric.metric_id === qa.metric)?.variants
    if (results?.last_error_at && results.last_error_at >= results.refresh_requested_at) {
      throw new Error('Flagsmith could not calculate results. Check docker compose logs processor.')
    }
    const included = variants && Object.entries(batch).every(([variant, counts]) =>
      (variants[variant]?.n ?? 0) >= (baseline[variant]?.n ?? 0) + counts.exposures &&
      (variants[variant]?.sum ?? 0) >= (baseline[variant]?.sum ?? 0) + counts.successes)
    if (included && results.as_of >= results.refresh_requested_at) {
      return { asOf: results.as_of, variants }
    }
    await delay(1_000)
  }
  throw new Error('Flagsmith accepted the events, but the refreshed results did not include the complete QA batch.')
}

async function verify() {
  const { qa, pilot, project } = JSON.parse(await readFile('.first-200/runs.json', 'utf8'))
  const env = loadEnv('qa', process.cwd())
  assert.notEqual(qa.environment, pilot.environment)
  assert.equal(env.VITE_FLAGSMITH_ENVIRONMENT_ID, qa.environment, 'QA must use the generated local QA environment')
  assert.equal(env.VITE_FLAGSMITH_API_URL, api, 'QA must use the local Flagsmith API')
  assert.equal(env.VITE_FLAGSMITH_EVENTS_URL, eventsApi, 'QA must use the local Flagsmith events API')

  const sendApi = await connect()
  const existing = await sendApi(experimentPath(qa.environment, qa.experiment) + 'results/')
  const baseline = existing.results?.payload?.metrics.find((metric) => metric.metric_id === qa.metric)?.variants ?? {}
  const totals = { [PANEL]: { exposures: 0, successes: 0 }, [INLINE]: { exposures: 0, successes: 0 } }
  const vite = await createServer({ mode: 'qa', server: { port: 0, open: false } })
  let browser
  try {
    await vite.listen()
    const url = vite.resolvedUrls.local[0]
    browser = await chromium.launch({ channel: 'chrome' })
    await outsideExperiment(browser, url)
    for (let attempts = 0; attempts < 24 && Object.values(totals).some(({ exposures }) => exposures < 2); attempts++) {
      await checkBrowser(browser, url, totals)
    }
    for (const counts of Object.values(totals)) {
      assert.ok(counts.exposures >= 2, 'QA did not receive both assignments twice')
      assert.equal(counts.successes, 1)
    }
    console.log('Simulated browser batch (one timely success per variant):')
    console.table(totals)
  } finally {
    await browser?.close()
    await vite.close()
  }

  const dashboard = await refreshResults(sendApi, qa, totals, baseline)
  const dashboardUrl = `${origin}/project/${project}/environment/${qa.environment}/experiments/${qa.experiment}`
  const evidence = { source: 'Simulated browser QA', batch: totals, dashboard, dashboardUrl }
  await writeFile('.first-200/qa-evidence.json', JSON.stringify(evidence, null, 2) + '\n')
  if (dashboard) {
    console.log('Flagsmith dashboard totals (all QA traffic):')
    console.table(Object.fromEntries(Object.entries(dashboard.variants).map(([variant, value]) =>
      [variant, { exposures: value.n, successes: value.sum }])))
  }
  console.log('Dashboard: ' + dashboardUrl)
}

try {
  await verify()
} catch (error) {
  console.error(error.message)
  console.error('Run npm run setup:local first. Browser verification also requires Google Chrome.')
  process.exitCode = 1
}
