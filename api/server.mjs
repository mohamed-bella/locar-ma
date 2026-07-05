// Vercel serverless function running the TanStack Start SSR handler.
//
// Use the Node `(req, res)` signature (unambiguous — Vercel's web-signature
// detection was misfiring and hanging) and bridge Node ↔ Web ourselves, the
// same way server.mjs does. Crucially we build an ABSOLUTE URL from the host
// header: Vercel hands the function a relative path (`/`), and the SSR handler
// does `new URL(req.url)` which throws on a relative input.
import { Readable } from 'node:stream'
import handler from '../dist/server/server.js'

export const config = { maxDuration: 30 }

export default async function (req, res) {
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
    response.headers.forEach((v, k) => res.setHeader(k, v))
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch (err) {
    console.error(err)
    res.statusCode = 500
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('SSR error:\n' + (err?.stack || String(err)))
  }
}
