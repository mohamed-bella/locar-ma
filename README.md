# Locar.ma

Car rental agency management SaaS for the Moroccan market. See `locar-mvp-spec.md`.

## Stack

| Layer | Tech |
|---|---|
| Framework | TanStack Start (React 19, Vite 8) |
| DB / Auth / Realtime | Supabase (PostgreSQL, RLS multi-tenant) |
| File storage | **Cloudflare R2** (S3-compatible) — damage photos, scanned IDs, contract PDFs |
| Hosting | **Vercel** |
| PDF | React-PDF (Phase 4) |
| WhatsApp | Meta Cloud API (Phase 4) |

> Deviates from the original spec: hosting is Vercel (not CapRover/Hetzner) and
> files live in Cloudflare R2 (not Supabase Storage).

## Setup

1. `npm install`
2. Copy env: `cp .env.example .env` and fill in:
   - **Supabase**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - **R2**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`
3. Apply DB migrations to your Supabase project (SQL editor or CLI):
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rls.sql`
4. (Optional) Regenerate DB types:
   `npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts`
5. `npm run dev` → http://localhost:3000

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build (client + SSR)
- `npm run typecheck` — `tsc --noEmit`

## Layout

- `src/routes/` — file-based routes. `_app.tsx` is the authed layout (guard + nav).
- `src/server/` — TanStack server functions.
- `src/lib/` — Supabase clients (`.server` = server-only), R2 client, env validation, schemas.
- `supabase/migrations/` — SQL schema + RLS.

## Cloudflare R2 setup (required for image upload)

Uploads go **straight from the browser to R2** via presigned PUT. Without CORS you'll
see `Failed to fetch`.

1. R2 → your bucket → **Settings → CORS Policy** → paste `r2-cors.json`
   (replace `YOUR-APP.vercel.app` with your real domain; keep the localhost origins for dev).
2. For photos to display, the bucket must be **public-read**: enable the r2.dev dev
   subdomain or attach a custom domain, and set `R2_PUBLIC_URL` to that base URL.

## Supabase Realtime (live updates)

Lists refresh automatically when data changes. Enable replication:
Supabase → **Database → Replication → `supabase_realtime`** → add the `vehicles` table
(and later `reservations`, `contracts`, `clients`). Without it the app still works,
just no live cross-device refresh.

## Deployment

`npm run build` emits a Web-standard SSR fetch server (`dist/server/server.js`) + static
client (`dist/client`). `server.mjs` wraps both into one Node HTTP server.

**Any Node host (Render / Railway / Fly / VPS) — recommended, verified:**
```
npm ci && npm run build
npm start          # runs server.mjs, listens on $PORT (default 3000)
```
Set all env vars from `.env.example` in the host. Node 18+.

**Vercel:** the current TanStack Start Vite build has no built-in Vercel target, so the
serverless adapter isn't emitted. Options: run `server.mjs` on a Node host (above), or
deploy on Vercel using their TanStack Start framework preset when importing the repo
(it supplies the adapter). Confirm SSR routes on first deploy.

## Multi-tenancy

Tenant boundary is `agency_id`. Every table has RLS restricting rows to members
of the owning agency (`is_agency_member()` / `agency_role()` helpers). The
service-role client is used only to bootstrap a new agency + its owner during
onboarding.
