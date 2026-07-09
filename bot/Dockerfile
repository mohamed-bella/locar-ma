# Debian (glibc) so sharp + baileys pull their prebuilt native binaries.
# Node 22+ required: @supabase/realtime-js needs the native WebSocket global
# (absent in Node 20, which crash-loops with "native WebSocket not found").
FROM node:22-bookworm-slim

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source + fonts (Tajawal for the Arabic/FR PDF) + the seed auth_info.
COPY . .

# The persistent volume mounts at /app/auth_info and would MASK anything baked
# there. So move the baked session to /app/auth_seed; the bot copies it into the
# (empty) volume on first boot — uploading your existing WhatsApp session so no
# QR rescan is needed. After that, the volume owns the evolving creds.
RUN if [ -d /app/auth_info ]; then mv /app/auth_info /app/auth_seed; fi; mkdir -p /app/auth_info

# MOUNT /app/auth_info AS A PERSISTENT VOLUME IN CAPROVER
# (App → Persistent Directories → path in app: /app/auth_info).
VOLUME ["/app/auth_info"]

ENV NODE_ENV=production
EXPOSE 80

CMD ["node", "src/index.js"]
