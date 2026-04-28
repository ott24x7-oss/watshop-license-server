# WatShop License Server

Admin panel + license API for WatShop Studio. Issues lifetime, single-PC license keys; verifies them via signed JWTs (RS256) so the desktop app can validate offline between heartbeats.

Stack: Hono · SQLite (better-sqlite3) · jose · bcryptjs · Node 20+

## Endpoints at a glance

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/admin` | session cookie | Admin dashboard |
| GET/POST | `/admin/licenses` | session | Create / list keys |
| POST | `/admin/licenses/:id/revoke` | session | Block a key |
| POST | `/api/activate` | license key | Bind a key to a PC, return signed JWT |
| POST | `/api/heartbeat` | Bearer JWT | Periodic re-validation, refresh JWT |
| POST | `/api/deactivate` | Bearer JWT | Release a PC slot |
| GET  | `/healthz` | none | Liveness probe |

## Local development

```bash
cd license-server
cp .env.example .env
npm install
npm run setup        # creates RS256 keypair + first admin user (interactive)
npm run dev          # starts on http://localhost:3000
```

Open `http://localhost:3000/admin` and sign in.

## File layout

```
license-server/
├── src/
│   ├── index.ts        # server entry
│   ├── db.ts           # SQLite + schema migrations
│   ├── jwt.ts          # RS256 key handling, sign/verify
│   ├── auth.ts         # admin password hashing + sessions
│   ├── keys.ts         # license key generation (WATS-XXXX-XXXX-XXXX-XXXX)
│   ├── admin.ts        # admin panel HTML routes
│   ├── api.ts          # public license API
│   └── views.ts        # inline HTML templates with brand colors
├── scripts/setup.ts    # interactive first-run setup
├── data/               # SQLite + RS256 keys live here (gitignored)
├── railway.json        # Railway deploy config
├── package.json
└── tsconfig.json
```

## Database

SQLite at `data/licenses.db`. Schema is migrated automatically on every server start. WAL mode + foreign keys are on.

Tables:
- `admin_users` — admin login accounts (bcrypt hashed)
- `sessions` — admin cookie sessions (7-day TTL)
- `licenses` — issued license keys (lifetime, status active/revoked)
- `devices` — per-PC activations (bound to license + machine fingerprint)
- `activation_logs` — audit trail of every activate/heartbeat/revoke

## How licensing works

1. Admin creates a license in the panel → server generates a unique `WATS-XXXX-XXXX-XXXX-XXXX` key.
2. Customer pays → admin sends them the setup `.exe` + the key.
3. On first launch, the desktop app prompts for the key and a machine fingerprint, calls `POST /api/activate`. The server records the device, signs a JWT (default 90 days), returns it.
4. The desktop app stores the JWT and verifies the **signature locally** with the embedded RS256 public key on every launch — works fully offline.
5. Roughly weekly the app calls `POST /api/heartbeat` to detect revocation. The server returns a refreshed JWT when the existing one is within 14 days of expiry.
6. If the license is revoked or the device is removed in the admin panel, the next heartbeat returns 403 and the app re-prompts for a key.

## Security model — what this protects against

✅ A user **forging a license JWT** — impossible without the server's RS256 private key.
✅ A user **using one key on many PCs** — server enforces `max_devices` (default 1) on activation.
✅ A user **continuing to use a revoked key** — heartbeat returns 403; app stops working within ~7 days.

❌ This does **not** stop a determined attacker patching the desktop app to skip the check — Electron is JavaScript; no client-side license is unbreakable. Mitigations: code obfuscation (`javascript-obfuscator`), keep premium features server-side (cloud render, asset downloads). For an educational-tier product these aren't worth the engineering time until you have paying customers asking for them.

## Deploying to Railway

1. **Create a new Railway project** from this folder (push to GitHub first, then *Deploy from GitHub Repo*).
2. **Add a volume** mounted at `/app/data` (Railway → service → *Settings* → *Volumes* → add). This is where SQLite + the RS256 keypair persist between deploys. **Without a volume, every redeploy wipes all licenses.**
3. **Set environment variables** in Railway → *Variables*:
   - `DATA_DIR=/app/data`
   - `SESSION_SECRET=<random 64 hex chars>` — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `BOOTSTRAP_ADMIN_USERNAME=admin`
   - `BOOTSTRAP_ADMIN_PASSWORD=<temp strong password>` — used only if no admin exists yet
   - `JWT_TTL_DAYS=90` (optional)
   - `NODE_ENV=production`
4. **Deploy**. Railway runs `npm ci && npm run build` then `node dist/src/index.js`.
5. **Sign in** at `https://<your-railway-domain>/admin` with the bootstrap credentials.
6. **Change the password** at `/admin/account` and **delete `BOOTSTRAP_ADMIN_PASSWORD`** from the environment variables.

Railway gives you a public domain by default. Add a custom domain (e.g. `licenses.watshop.in`) under *Settings* → *Networking*.

## Backups

The whole state lives in `data/`. To back up:

```bash
# from anywhere with rail CLI
railway run "tar czf /tmp/backup.tgz /app/data" && railway cp <service>:/tmp/backup.tgz ./backup.tgz
```

Or use Railway volume snapshots if available on your plan.

## Connecting the desktop app

The admin panel's **Integration** page shows your server's public RS256 key and the API endpoints. To wire the desktop app:

1. Embed the public PEM in `electron/main.ts` (or as a constant in the renderer).
2. On first run, the app collects a stable `machineId` (e.g. `crypto.createHash('sha256').update(os.hostname() + os.networkInterfaces()).digest('hex')`).
3. Show a license entry screen, call `POST /api/activate` with `{ key, machineId, machineName, os, appVersion }`.
4. Store the returned JWT in `app.getPath('userData')/license.json`.
5. On each launch, verify the JWT signature locally (using `jose` or `crypto.verify`). If valid → continue.
6. On a 7-day timer (or every launch with a debounce), call `POST /api/heartbeat` with the JWT. If the response includes a refreshed `token`, replace the stored one. If it returns 403, re-prompt for a license.
7. To let users move between PCs, surface a "Sign out of this PC" option that calls `POST /api/deactivate`.

The integration code itself isn't in this folder — that's the next task.
