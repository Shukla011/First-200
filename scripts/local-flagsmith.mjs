import { readFile } from 'node:fs/promises'

const port = process.env.FIRST_200_FLAGSMITH_PORT || '18180'
export const origin = new URL('http://127.0.0.1:' + port).origin
export const api = origin + '/api/v1/'
export const eventsApi = origin + '/api/'
export const accountFile = '.first-200/account.json'

export async function request(path, { body, token, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(api + path, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: 'Token ' + token }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    const error = new Error(`Flagsmith ${method} ${path} returned HTTP ${response.status}.`)
    error.status = response.status
    throw error
  }
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

export async function connect() {
  const account = JSON.parse(await readFile(accountFile, 'utf8'))
  const session = await request('auth/login/', { body: account })
  return (path, body, method) => request(path, { body, method, token: session.key })
}

export function experimentPath(environment, experiment) {
  return `environments/${environment}/experiments/${experiment}/`
}
