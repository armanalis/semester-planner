import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { networkInterfaces } from 'node:os'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const readBody = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })

/** This computer's Wi-Fi address, so a phone on the same network can open the dev server. */
const lanAddress = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address

/**
 * Runs the files in /api (Vercel Functions with Web Request/Response handlers) inside the dev server,
 * so sync works locally exactly like after deploying.
 */
function apiDev(): Plugin {
  return {
    name: 'api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, `http://${req.headers.host}`)
        const name = url.pathname.slice('/api/'.length).replace(/\/$/, '')

        if (name === 'lan') {
          const ip = lanAddress()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ url: ip ? `http://${ip}:${server.config.server.port ?? 5173}` : null }))
          return
        }
        if (!/^[a-z-]+$/.test(name)) return next()

        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`)
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined
          if (!handler) {
            res.statusCode = 405
            res.end()
            return
          }
          const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(await readBody(req))
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const response = await handler(new Request(url, { method: req.method, headers, body }))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.ssrFixStacktrace(error as Error)
          console.error(error)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String((error as Error).message ?? error) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // make .env.local (e.g. the Upstash sync credentials) visible to the /api handlers in dev
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[k] ??= v
  return {
    plugins: [react(), tailwindcss(), apiDev()],
    // listen on the local network too, so your phone can open the app on the same Wi-Fi
    server: { host: true, port: 5173 },
  }
})
