// Portable production server: serves the built client assets (dist/client)
// and hands everything else to the TanStack Start SSR fetch handler.
// Works on any Node host (Render, Railway, Fly, a VPS…). Node 18+.
import './instrument.server.mjs' // Sentry — must load before the app handler
import * as Sentry from '@sentry/tanstackstart-react'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, normalize } from 'node:path'
import handler from './dist/server/server.js'

const CLIENT = join(process.cwd(), 'dist', 'client')
const PORT = process.env.PORT || 3000

const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain',
}

async function staticFile(pathname) {
  if (pathname === '/') return null
  const clean = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const fp = join(CLIENT, clean)
  if (!fp.startsWith(CLIENT)) return null
  try {
    const st = await stat(fp)
    if (st.isFile()) return fp
  } catch {
    /* not a static file */
  }
  return null
}

createServer(async (req, res) => {
  try {
    const fp = await staticFile(req.url.split('?')[0])
    if (fp) {
      const ext = fp.slice(fp.lastIndexOf('.'))
      res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
      if (fp.includes(`${join('/', 'assets', '/')}`) || fp.includes('\\assets\\')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
      createReadStream(fp).pipe(res)
      return
    }

    const url = `http://${req.headers.host}${req.url}`
    const init = { method: req.method, headers: req.headers }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req)
      init.duplex = 'half'
    }
    const response = await handler.fetch(new Request(url, init))
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch (err) {
    console.error(err)
    Sentry.captureException(err)
    res.statusCode = 500
    res.end('Internal Server Error')
  }
}).listen(PORT, () => console.log(`Locar running on http://localhost:${PORT}`))
