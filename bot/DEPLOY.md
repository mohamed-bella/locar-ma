# Deploy the WhatsApp bot to CapRover (Hetzner)

The bot is a long-running process holding a WhatsApp session. The session lives in
`/app/auth_info` — **this MUST be a persistent volume** or every redeploy forces a
new QR scan.

## 0. Prereqs
- CapRover already running on your Hetzner server (e.g. `https://captain.your-domain.com`)
- CapRover CLI: `npm i -g caprover`

## 1. Create the app
CapRover dashboard → **Apps → Create New App**
- Name: `rentiq-bot`
- ✅ **Has Persistent Data** (required for the WhatsApp session)
- Create

## 2. Persistent directory (do this BEFORE the first deploy)
App `rentiq-bot` → **App Configs → Persistent Directories → Add Persistent Directory**
- **Path in App:** `/app/auth_info`
- **Label:** `rentiq-auth`
- Save & Update

> If you scan the QR *before* setting this, the session gets wiped on the next
> deploy and you'll rescan. Set it first.

## 3. Environment variables
Same page → **Environmental Variables** → add:
```
SUPABASE_URL=https://hcgewqjymxylklavktph.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
R2_PUBLIC_URL=https://pub-c5eff1eef0cf4dd8a671d0798d430d67.r2.dev
REPORT_HOUR=8
```
Save & Update.

## 4. Instance count = 1 (important)
App Configs → keep **Instance Count = 1**. Two instances = two WhatsApp sessions
fighting over the same account → `connectionReplaced` loops. Never scale this app
horizontally.

## 5. Container port
App Configs → **Container HTTP Port = 80** (the health server listens there).
If you don't need a public URL, you can leave the app un-exposed — the health
check still works internally. To reach `/health` from a browser, enable HTTPS + a
domain for the app.

## 6. Deploy (from this `bot/` folder)
```bash
cd bot
caprover deploy \
  --caproverUrl https://captain.your-domain.com \
  --appName rentiq-bot \
  --appToken ce9dd6b61f1db4b0a07d75dbb7ed0afbacfafe81e9fa31f8f897aed31b674fc6
```
This tarballs the folder (respecting `.dockerignore` — `auth_info`, `.env`,
`node_modules` are excluded), builds the Dockerfile, and rolls out.

> ⚠️ That app token was shared in plain text — **regenerate it** in CapRover
> (App → Deployment → "app-specific tokens") after your first successful deploy.

## 7. First boot — session is seeded (no QR needed)
Your **local WhatsApp session is baked into the image** (from `bot/auth_info`) and
copied into the persistent volume on first boot. App Logs should show:
```
🌱 Seeded WhatsApp session from image → persistent volume
✅ WhatsApp connected
```
No QR scan required. **Stop the bot locally before/while deploying** — the same
account can't run two live sessions (they'll knock each other off with
`connectionReplaced`).

If the seed is missing or WhatsApp invalidates it, the logs fall back to the ASCII
QR — scan it once with WhatsApp → **Linked Devices → Link a Device**. After that
the volume owns the session and future deploys reconnect with no rescan.

> 🔒 The image now contains your live WhatsApp credentials. CapRover builds and
> stores the image on your own Hetzner server, so it stays private — but do NOT
> push this image to a shared/public registry. Once the volume is seeded you can
> re-ignore `auth_info` for future builds if you prefer.

## 8. Verify
- App Logs: `🟢 Bot running — listening for notifications`
- Health: `https://rentiq-bot.your-domain.com/health` → `{"status":"ok","whatsapp":"connected"}`
- Create a reservation in the app → owner gets the WhatsApp message
- Message `rapport` from the agency number → PDF report comes back

## Redeploying later
Just rerun the `caprover deploy` command. The session persists; no rescan. To force
a fresh login, delete the `/app/auth_info` contents (App → this volume) and redeploy.

## Notes
- **sharp / baileys native binaries**: the Dockerfile uses `node:20-bookworm-slim`
  (glibc) so their prebuilt binaries install cleanly. Don't switch to Alpine.
- **Memory**: PDF rendering + image conversion is the heaviest task. A small
  Hetzner instance is fine; if reports get large, give the app ~512MB–1GB.
- **No `.env` in the container**: env comes from CapRover's variables. `dotenv`
  silently no-ops when there's no `.env` file.
