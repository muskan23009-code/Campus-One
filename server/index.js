import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { createServer as createViteServer } from 'vite'
import { createCampusApp } from './app.js'
import { loadProjectEnvironment } from './env.js'
import { createStore } from './store.js'

loadProjectEnvironment()

export async function startServer(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production'
  const port = Number(options.port ?? process.env.PORT ?? 5173)
  const store = options.store || createStore(options.dataDirectory || process.env.CAMPUS_DATA_DIR || resolve('.data'))
  const sessionSecret = options.sessionSecret || await store.getSessionSecret()
  let vite
  const handler = createCampusApp({
    store,
    sessionSecret,
    staticDirectory: production ? resolve(options.staticDirectory || 'dist') : null,
  })
  const server = createServer(handler)

  if (!production) {
    vite = await createViteServer({
      configFile: resolve('vite.config.js'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    })
    const app = createCampusApp({ store, sessionSecret, viteMiddleware: vite.middlewares })
    server.removeAllListeners('request')
    server.on('request', app)
  }

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, '0.0.0.0', resolveListen)
  })
  console.log(`Campus One ${production ? 'production' : 'development'} server listening on http://0.0.0.0:${port}`)

  async function close() {
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
    await vite?.close()
  }

  return { server, store, close }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startServer().catch((error) => {
    console.error('Could not start Campus One:', error)
    process.exitCode = 1
  })
}