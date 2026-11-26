import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { FLAG, PANEL, INLINE, SUCCESS_EVENT } from '../src/experiment.js'
import { accountFile, api, connect, eventsApi, experimentPath, origin, request } from './local-flagsmith.mjs'

const projectName = 'First 200'
const experimentName = 'First 200 · Error help placement'
const metricName = 'First 200 within 60 seconds'

async function account() {
  try {
    return JSON.parse(await readFile(accountFile, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const credentials = { email: 'local@example.invalid', password: randomBytes(24).toString('hex') }
  await mkdir('.first-200', { recursive: true, mode: 0o700 })
  await writeFile(accountFile, JSON.stringify(credentials, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  return credentials
}

async function waitForFlagsmith() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(origin + '/version/', { signal: AbortSignal.timeout(1_500) })
      if (response.ok) return response.json()
    } catch {
      // The dashboard starts after the database migrations.
    }
    await delay(1_000)
  }
  throw new Error('Flagsmith did not start. Check docker compose logs flagsmith.')
}

async function ensure(send, path, filter, body, createPath = path) {
  const response = await send(path)
  const items = Array.isArray(response) ? response : response.results
  return items.find(filter) ?? await send(createPath, body)
}

async function setup() {
  const docker = spawnSync('docker', ['compose', 'up', '-d'], { stdio: 'inherit' })
  if (docker.error) throw docker.error
  if (docker.status !== 0) throw new Error('Start Docker and rerun npm run setup:local.')

  const version = await waitForFlagsmith()
  const credentials = await account()
  if (!version.self_hosted_data.has_users) {
    await request('auth/users/', {
      body: { ...credentials, re_password: credentials.password, first_name: 'First', last_name: '200', superuser: true },
    })
  }

  const send = await connect()
  const organisation = await ensure(send, 'organisations/', (org) => org.name === projectName, { name: projectName })
  const project = await ensure(send, 'projects/', (item) => item.name === projectName && item.organisation === organisation.id,
    { name: projectName, organisation: organisation.id })
  const features = `projects/${project.id}/features/`
  const flag = await ensure(send, features, (item) => item.name === FLAG,
    { name: FLAG, initial_value: PANEL, default_enabled: true, type: 'MULTIVARIATE' })
  const optionsPath = features + flag.id + '/mv-options/'
  const variants = []
  for (const value of [PANEL, INLINE]) {
    variants.push(await ensure(send, optionsPath, (item) => item.key === value, {
      feature: flag.id, key: value, type: 'unicode', string_value: value, default_percentage_allocation: 0,
    }))
  }

  const runs = {}
  for (const [mode, name] of [['qa', 'QA · Simulated traffic'], ['pilot', 'Pilot · Human visitors']]) {
    const env = await ensure(send, `environments/?project=${project.id}`,
      (item) => item.name === name && item.project === project.id,
      { name, project: project.id }, 'environments/')
    const path = `environments/${env.api_key}/`
    const warehouse = await ensure(send, path + 'warehouse-connections/', (item) => item.warehouse_type === 'postgres',
      { warehouse_type: 'postgres', config: { source: 'flagsmith_database' } })
    if (warehouse.status !== 'connected') throw new Error(`The ${mode} warehouse is ${warehouse.status}.`)
    const metric = await ensure(send, path + 'experiment-metrics/', (item) => item.name === metricName, {
      name: metricName, aggregation: 'occurrence', direction: 'up', definition: { version: 1, event: SUCCESS_EVENT },
    })
    const experiment = await ensure(send, path + 'experiments/', (item) => item.name === experimentName, {
      name: experimentName,
      feature: flag.id,
      hypothesis: 'Showing the fix directly beneath the error increases the share of visitors who reach 200 OK within 60 seconds.',
      metrics: [{ metric: metric.id, expected_direction: 'increase' }],
      experiment_rollout: {
        enabled: true,
        rollout_percentage: 100,
        feature_state_value: { type: 'string', value: PANEL },
        multivariate_feature_state_values: variants.map((option) => ({
          multivariate_feature_option: option.id,
          percentage_allocation: 50,
        })),
      },
    })
    const experimentUrl = experimentPath(env.api_key, experiment.id)
    let current = await send(experimentUrl)
    if (['created', 'draft'].includes(current.status)) {
      await send(experimentUrl + 'start/', {})
      current = await send(experimentUrl)
    }
    if (current.status !== 'running') throw new Error(`The ${mode} experiment is ${current.status}.`)
    runs[mode] = { environment: env.api_key, experiment: experiment.id, metric: metric.id }
  }

  for (const [mode, run] of Object.entries(runs)) {
    await writeFile(`.env.${mode}.local`, [
      '# Generated by npm run setup:local',
      `VITE_FLAGSMITH_ENVIRONMENT_ID=${run.environment}`,
      `VITE_FIRST_200_EXPERIMENT_RUN=${mode}-${run.experiment}`,
      `VITE_FLAGSMITH_API_URL=${api}`,
      `VITE_FLAGSMITH_EVENTS_URL=${eventsApi}`,
      '',
    ].join('\n'))
  }
  await writeFile('.first-200/runs.json', JSON.stringify({ project: project.id, ...runs }, null, 2) + '\n')
  console.log('QA and human-pilot experiments are running in separate Flagsmith environments.')
  console.log('Dashboard: ' + origin + ' (local credentials in ' + accountFile + ')')
  for (const [mode, run] of Object.entries(runs)) {
    console.log(`${mode}: ${origin}/project/${project.id}/environment/${run.environment}/experiments/${run.experiment}`)
  }
}

try {
  await setup()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
