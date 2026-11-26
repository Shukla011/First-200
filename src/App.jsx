import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { experiment, INLINE, PANEL } from './experiment.js'

const endpoint = '/api/demo/profile'
const statuses = { 401: '401 Unauthorized', 200: '200 OK' }

function Troubleshooting({ inline }) {
  return (
    <aside className={`help ${inline ? 'help-inline' : 'help-panel'}`} aria-labelledby="help-title">
      <h2 id="help-title"><span aria-hidden="true">?</span> Troubleshooting</h2>
      <p>This endpoint requires an Authorization header. Enter <code>Bearer first-200-demo</code> in the Authorization field and send the request again.</p>
    </aside>
  )
}

export default function App() {
  const [authorization, setAuthorization] = useState('')
  const [response, setResponse] = useState(null)
  const [variant, setVariant] = useState(null)
  const [pending, setPending] = useState(false)
  const [retry, setRetry] = useState(false)
  const inFlight = useRef(false)
  const focusAfterRequest = useRef(null)

  useLayoutEffect(() => {
    if (pending || !focusAfterRequest.current) return
    if (document.activeElement === document.body) focusAfterRequest.current.focus()
    focusAfterRequest.current = null
  }, [pending])

  useEffect(() => {
    let active = true
    void experiment.restore().then((saved) => {
      if (active && saved) setVariant((current) => current ?? saved)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  async function send(event) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    const submitter = event.nativeEvent.submitter
    if (submitter === document.activeElement) focusAfterRequest.current = submitter
    setPending(true)
    setRetry(false)

    let result
    try {
      const value = authorization.trim()
      const reply = await fetch(endpoint, {
        headers: value ? { Authorization: value } : undefined,
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(12_000),
      })
      if (!Object.hasOwn(statuses, reply.status)) throw new Error('Unexpected response status')
      result = { status: reply.status, body: await reply.json() }
    } catch {
      setRetry(true)
    }

    if (result) {
      const receivedAt = Date.now()
      setResponse(result)
      if (result.status === 401 && !variant) {
        try {
          await experiment.showHelp((assignment) => flushSync(() => setVariant(assignment)))
        } catch {
          setVariant(PANEL)
        }
      }
      if (result.status === 200) void experiment.recordSuccess(receivedAt).catch(() => {})
    }
    inFlight.current = false
    setPending(false)
  }

  return (
    <>
      <header className="site-header">
        <div className="shell brand">
          <span className="brand-mark" aria-hidden="true">&gt;_</span>
          <span>First 200</span>
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-detail">API sandbox</span>
        </div>
      </header>
      <main className="shell">
        <section className="intro" aria-labelledby="task">
          <h1 id="task">Make this request<br className="intro-break" /> return <strong>200 OK.</strong></h1>
        </section>
        <div className="workspace">
          <div className="console">
            <section className="request" aria-labelledby="request-title">
              <h2 className="section-title" id="request-title"><span aria-hidden="true">↗</span> Request</h2>
              <div className="route"><span className="method">GET</span><code>{endpoint}</code></div>
              <form onSubmit={send}>
                <label htmlFor="authorization">Authorization</label>
                <input
                  id="authorization"
                  type="text"
                  value={authorization}
                  onChange={(event) => setAuthorization(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <button disabled={pending} type="submit">Send request <span aria-hidden="true">→</span></button>
              </form>
            </section>

            <section className="response" aria-labelledby="response-title">
              <div className="response-header">
                <h2 className="section-title" id="response-title"><span aria-hidden="true">↙</span> Response</h2>
                <span className="format">JSON</span>
              </div>
              <div className="response-body">
                <div role="status" aria-live="polite" aria-atomic="true">
                  {retry && <p className="retry">The request could not be completed. Please try again.</p>}
                  {response ? (
                    <>
                      <p className={`status status-${response.status}`}>{statuses[response.status]}</p>
                      <pre>{JSON.stringify(response.body, null, 2)}</pre>
                      {response.status === 200 && <p className="success">You made your first successful API request.</p>}
                    </>
                  ) : !retry && (
                    <p className="waiting">{pending ? 'Sending request…' : 'Send a request to see the response.'}</p>
                  )}
                </div>
                {variant === INLINE && response?.status !== 200 && <Troubleshooting inline />}
              </div>
            </section>
          </div>
          {variant === PANEL && response?.status !== 200 && <Troubleshooting />}
        </div>
      </main>
    </>
  )
}
