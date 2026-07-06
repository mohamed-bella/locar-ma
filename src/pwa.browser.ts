// Register the service worker (browser-only). Imported from src/router.tsx.
// Filename avoids the `.client.` pattern so TanStack Start's import-protection
// allows it to be reached from server-loaded code, where the guard no-ops.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration is best-effort; app works without it */
    })
  })
}
