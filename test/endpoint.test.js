import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createAppServer } from '../server/index.js'

test('the same-origin endpoint verifies the exact dummy Authorization header', async () => {
  const server = createAppServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/demo/profile`
    for (const headers of [undefined, { Authorization: 'Bearer wrong' }]) {
      const response = await fetch(url, { headers })
      assert.equal(response.status, 401)
      assert.deepEqual(await response.json(), { error: 'Unauthorized' })
    }
    const success = await fetch(url, { headers: { Authorization: 'Bearer first-200-demo' } })
    assert.equal(success.status, 200)
    assert.deepEqual(await success.json(), { name: 'Demo Developer' })
    const unauthorizedMethod = await fetch(url, { method: 'POST' })
    assert.equal(unauthorizedMethod.status, 405)
    assert.equal(unauthorizedMethod.headers.get('Allow'), 'GET')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
