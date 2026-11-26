import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createAppServer } from './server/index.js'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'first-200-demo-api',
      async configureServer(vite) {
        const api = createAppServer()
        await new Promise((resolve, reject) => {
          api.once('error', reject)
          api.listen(0, '127.0.0.1', resolve)
        })

        vite.httpServer.once('close', () => api.close())
        vite.config.server.proxy = { '/api/': `http://127.0.0.1:${api.address().port}` }
      },
    },
  ],
  server: { host: '127.0.0.1', strictPort: true },
})
