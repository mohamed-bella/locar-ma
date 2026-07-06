// Vercel serverless function running the TanStack Start SSR handler.
//
// Node `(req, res)` signature (arity 2 → Vercel treats it as a Node handler,
// not a Web one) and we bridge Node ↔ Web ourselves like server.mjs does.
// Two Vercel-specific details:
//   1. Build an ABSOLUTE URL from the host header — Vercel passes a relative
//      path (`/`) and the SSR handler's `new URL()` throws on it.
//   2. BUFFER the response instead of piping the web stream — streaming the
//      React SSR body through res was hanging the function to a 30s timeout.
import { Readable } from 'node:stream'
import handler from '../dist/server/server.js'

export const config = { maxDuration: 30 }

export default async function (req, res) {
  // No favicon route — answer instantly instead of paying an SSR render.
  if (req.url === '/favicon.ico' || req.url === '/favicon.png') {
    res.statusCode = 204
    res.end()
    return
  }

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const url = `${proto}://${host}${req.url}`

    const init = { method: req.method, headers: req.headers }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req)
      init.duplex = 'half'
    }

    const response = await handler.fetch(new Request(url, init))
    res.statusCode = response.status
    response.headers.forEach((v, k) => {
      // content-length is recomputed from the buffer below.
      if (k.toLowerCase() !== 'content-length') res.setHeader(k, v)
    })
    const body = Buffer.from(await response.arrayBuffer())
    res.setHeader('content-length', body.byteLength)
    res.end(body)
  } catch (err) {
    console.error(err)
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('SSR error:\n' + (err?.stack || String(err)))
  }
}
