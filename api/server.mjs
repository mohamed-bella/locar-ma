// Vercel serverless function that runs the TanStack Start SSR handler.
// This TanStack Start version ships a "bring-your-own-server" build
// (dist/server/server.js exposes a Web `fetch(Request) -> Response`). Vercel's
// Node runtime supports the Fetch signature, so we just delegate to it.
// vercel.json rewrites every non-static request here.
import handler from '../dist/server/server.js'

export const config = { maxDuration: 30 }

export default async function (request) {
  return handler.fetch(request)
}
