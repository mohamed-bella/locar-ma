import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: { port: 3000 },
  // Vite 8 resolves tsconfig `paths` (~/* -> src/*) natively.
  // `lucide-react` is aliased to our Phosphor duotone adapter so every icon
  // renders in the heavier duotone style with no call-site changes.
  resolve: {
    tsconfigPaths: true,
    alias: {
      'lucide-react': fileURLToPath(new URL('./src/lib/icons.tsx', import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    // Deploy target (Vercel) is configured at build/output level in Phase 6,
    // not here — the plugin's `target` option selects the UI framework, not the host.
    tanstackStart(),
    viteReact(),
  ],
})
