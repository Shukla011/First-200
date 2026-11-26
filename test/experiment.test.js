import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createExperiment, FLAG, INLINE, PANEL, qualifies, SUCCESS_EVENT } from '../src/experiment.js'

function fixture({ variant = INLINE, enrolled = true, sdkAvailable = true, storageAvailable = true, environment = 'qa' } = {}) {
  let time = 10_000
  const entries = new Map()
  const exposures = []
  const conversions = []
  const flag = { value: variant, variant, enabled: true, experiment: { inExperiment: enrolled } }
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  }
  const browser = {
    get localStorage() {
      if (!storageAvailable) throw new Error('Storage blocked')
      return storage
    },
    crypto: globalThis.crypto,
  }

  function open(run) {
    let identity
    const sdk = {
      async init(config) {
        if (!sdkAvailable) throw new Error('Flagsmith offline')
        assert.equal(config.enableEvents, true)
        identity = config.identity
      },
      eventsEnabled: true,
      getContext: () => ({ identity: { identifier: identity } }),
      getAllFlags: () => ({ [FLAG]: flag }),
      getExperimentFlag: (key) => {
        exposures.push({ key, identity, variant })
        return flag
      },
      trackEvent: (name, options) => conversions.push({ name, ...options }),
      async flushEvents() {},
    }
    return createExperiment({ environment, run, sdk, browser, now: () => time })
  }
  return { open, exposures, conversions, entries, setTime: (next) => { time = next } }
}

test('the 60-second window includes both endpoints', () => {
  assert.equal(qualifies(1_000, 61_000), true)
  assert.equal(qualifies(1_000, 60_999), true)
  assert.equal(qualifies(1_000, 61_001), false)
  assert.equal(qualifies(1_000, 999), false)
  assert.equal(qualifies(null, 1_000), false)
})

for (const variant of [PANEL, INLINE]) {
  test(`${variant} is exposed once and converts once with the same browser ID`, async () => {
    const { open, exposures, conversions, entries, setTime } = fixture({ variant })
    const session = open()
    assert.equal(await session.restore(), null)
    assert.equal(exposures.length, 0)
    await session.recordSuccess()
    assert.equal(conversions.length, 0)
    const show = (value) => { assert.equal(value, variant) }
    await Promise.all([session.showHelp(show), session.showHelp(show)])
    assert.equal(exposures.length, 1)
    assert.equal(exposures[0].key, FLAG)

    setTime(60_000)
    const reload = open()
    assert.equal(await reload.restore(), variant)
    await reload.showHelp(show)
    setTime(70_000)
    await Promise.all([reload.recordSuccess(), reload.recordSuccess(), session.recordSuccess()])

    assert.deepEqual(conversions, [{ name: SUCCESS_EVENT, identifier: exposures[0].identity }])
    assert.equal(exposures.length, 1)
    assert.deepEqual(JSON.parse([...entries.values()][0]), {
      id: exposures[0].identity, variant, exposedAt: 10_000, completed: true,
    })
    assert.equal(await open('next-run').restore(), null)
  })
}

test('reloading after 50 seconds leaves a success 15 seconds later outside the window', async () => {
  const { open, setTime, exposures, conversions } = fixture()
  await open().showHelp(() => {})
  setTime(60_000)
  const reload = open()
  assert.equal(await reload.restore(), INLINE)
  setTime(75_000)
  await reload.recordSuccess()
  assert.equal(exposures.length, 1)
  assert.equal(conversions.length, 0)
})

for (const [reason, options] of [
  ['inactive experiment', { enrolled: false }],
  ['unknown assignment', { variant: 'unrecognized' }],
  ['offline SDK', { sdkAvailable: false }],
  ['unavailable storage', { storageAvailable: false }],
  ['missing environment', { environment: null }],
]) {
  test(`${reason} uses unmeasured troubleshooting help`, async () => {
    const { open, exposures, conversions } = fixture(options)
    const session = open()
    await session.showHelp((variant) => { assert.equal(variant, PANEL) })
    await session.recordSuccess()
    assert.equal(exposures.length, 0)
    assert.equal(conversions.length, 0)
  })
}
