// Vercel serverless function that runs the TanStack Start SSR handler.
// Dynamic import inside try/catch so BOTH a missing/untraced build output and
// a runtime error (e.g. missing env vars) surface as readable text instead of
// an opaque FUNCTION_INVOCATION_FAILED. Revert to a plain delegate once green.
export const config = { maxDuration: 30 }

export default async function (request) {
  try {
    const mod = await import('../dist/server/server.js')
    return await mod.default.fetch(request)
  } catch (err) {
    return new Response(
      'SSR boot/runtime error:\n\n' + (err?.stack || err?.message || String(err)),
      { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }
}
