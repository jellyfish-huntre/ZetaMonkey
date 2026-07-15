import { Buffer } from 'node:buffer'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const leaderboardRunDevApi = (): Plugin => ({
  name: 'leaderboard-run-dev-api',
  configureServer(server) {
    server.middlewares.use('/api/leaderboard-run', async (request, response) => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))

      const headers = new Headers()
      Object.entries(request.headers).forEach(([name, value]) => {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item))
        else if (value !== undefined) headers.set(name, value)
      })

      const method = request.method || 'GET'
      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined
      const { handleLeaderboardRun } = await server.ssrLoadModule('/api/leaderboard-run.ts') as typeof import('./api/leaderboard-run')
      const result = await handleLeaderboardRun(new Request('http://127.0.0.1/api/leaderboard-run', {
        method,
        headers,
        ...(method === 'GET' || method === 'HEAD' ? {} : { body }),
      }))

      response.statusCode = result.status
      result.headers.forEach((value, name) => response.setHeader(name, value))
      response.end(Buffer.from(await result.arrayBuffer()))
    })
  },
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), leaderboardRunDevApi()],
  }
})
