import { createFlagsmithInstance } from '@flagsmith/flagsmith'

export const FLAG = 'error_help_placement'
export const SUCCESS_EVENT = 'first_200_success'
export const PANEL = 'troubleshooting_panel'
export const INLINE = 'inline_fix'
const variants = [PANEL, INLINE]

export function qualifies(exposedAt, completedAt) {
  if (!Number.isFinite(exposedAt)) return false
  const elapsed = completedAt - exposedAt
  return elapsed >= 0 && elapsed <= 60_000
}

export function createExperiment({
  environment, run = 'first-200-v1', api, eventsApiUrl,
  browser = globalThis, sdk = createFlagsmithInstance(), now = Date.now,
} = {}) {
  const key = `first-200:${JSON.stringify([environment ?? '', run])}`
  let storage
  let state = { id: null, variant: null, exposedAt: null, completed: false }
  let ready
  let pending = Promise.resolve()

  function read() {
    try {
      const saved = JSON.parse(storage.getItem(key))
      if (saved?.id && (saved.variant === null || variants.includes(saved.variant))) {
        state = saved
      }
    } catch {
      storage = undefined
    }
    return state
  }

  function save(next) {
    state = next
    if (!storage) return false
    try {
      storage.setItem(key, JSON.stringify(next))
      return true
    } catch {
      storage = undefined
      return false
    }
  }

  function serialize(action) {
    if (browser.navigator?.locks) return browser.navigator.locks.request(key, action)
    const operation = pending.then(action)
    pending = operation.catch(() => {})
    return operation
  }

  function start() {
    ready ??= serialize(() => {
      try {
        storage = browser.localStorage
        read()
        return save({ ...state, id: state.id ?? browser.crypto.randomUUID() }) && environment
      } catch {
        storage = undefined
        return false
      }
    }).then(async (enabled) => {
      if (!enabled) return false
      await sdk.init({
        environmentID: environment,
        identity: state.id,
        enableEvents: true,
        ...(api && { api }),
        ...(eventsApiUrl && { eventProcessorConfig: { eventsApiUrl } }),
        fetch: (url, options = {}) => {
          const timeout = AbortSignal.timeout(4_000)
          const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
          return browser.fetch(url, { ...options, signal })
        },
      })
      return sdk.eventsEnabled && sdk.getContext().identity?.identifier === state.id
    }).catch(() => false)
    return ready
  }

  function flush() {
    // The SDK retries transient delivery failures. Verify ingestion in the dashboard.
    void sdk.flushEvents().catch(() => {})
  }

  return {
    async restore() {
      start()
      return serialize(() => read().variant)
    },

    async showHelp(render) {
      const enabled = await start()
      return serialize(() => {
        const current = read()
        if (current.variant) return render(current.variant)

        const flag = enabled && storage && sdk.getAllFlags()?.[FLAG]
        const eligible = flag?.enabled && flag.experiment?.inExperiment &&
          variants.includes(flag.value) && flag.variant === flag.value

        if (eligible) {
          // Read at the point of display. This SDK call queues the exposure.
          const assignment = sdk.getExperimentFlag(FLAG)
          render(assignment.value)
          save({ ...current, variant: assignment.value, exposedAt: now() })
          flush()
          return
        }

        render(PANEL)
        save({ ...current, variant: PANEL })
      })
    },

    async recordSuccess(completedAt = now()) {
      // Avoid blocking an unexposed success on Flagsmith or event delivery.
      if (!qualifies((await serialize(read)).exposedAt, completedAt) || !await start()) return
      await serialize(() => {
        const current = read()
        if (current.completed || !qualifies(current.exposedAt, completedAt)) return
        if (!save({ ...current, completed: true })) return
        try {
          sdk.trackEvent(SUCCESS_EVENT, { identifier: current.id })
        } catch {
          save(current)
          return
        }
        flush()
      })
    },
  }
}

const env = import.meta.env ?? {}
export const experiment = createExperiment({
  environment: env.VITE_FLAGSMITH_ENVIRONMENT_ID,
  run: env.VITE_FIRST_200_EXPERIMENT_RUN || undefined,
  api: env.VITE_FLAGSMITH_API_URL,
  eventsApiUrl: env.VITE_FLAGSMITH_EVENTS_URL,
})
