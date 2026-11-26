import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = fileURLToPath(new URL('../dist', import.meta.url))
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

export function createAppServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/api/demo/profile') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET')
        return json(response, 405, { error: 'Method Not Allowed' })
      }
      if (request.headers.authorization === 'Bearer first-200-demo') {
        return json(response, 200, { name: 'Demo Developer' })
      }
      response.setHeader('WWW-Authenticate', 'Bearer realm="first-200-demo"')
      return json(response, 401, { error: 'Unauthorized' })
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD')
      return json(response, 405, { error: 'Method Not Allowed' })
    }

    try {
      const path = resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
      if (!path.startsWith(dist + sep)) return json(response, 404, { error: 'Not Found' })
      const file = await stat(path)
      if (!file.isFile()) return json(response, 404, { error: 'Not Found' })

      response.writeHead(200, {
        'Content-Type': contentTypes[extname(path)] ?? 'application/octet-stream',
        'Content-Length': file.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      if (request.method === 'HEAD') return response.end()
      createReadStream(path).on('error', () => response.destroy()).pipe(response)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error instanceof URIError) {
        return json(response, 404, { error: 'Not Found' })
      }
      return json(response, 500, { error: 'Internal Server Error' })
    }
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173)
  createAppServer().listen(port, process.env.HOST ?? '127.0.0.1', () => {
    console.log(`First 200 listening on port ${port}`)
  })
}
