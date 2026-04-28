# Full deploy guide — WatShop Studio + License Server

Time required: **30–45 minutes** end to end.
What you'll have at the end: a public license-server URL on Railway, a working admin panel, and a Windows installer (`Setup.exe`) configured to talk to your live server, attached to a GitHub Release that customers download from.

---

## Prerequisites (5 min)

You need accounts on:

- [x] **GitHub** — already done (`ott24x7-oss`)
- [ ] **Railway** — sign up at <https://railway.com> using *Login with GitHub* (easiest)
- [ ] *(Optional)* **Cloudflare** — only if you want a custom domain like `licenses.watshop.in`

You need installed locally:

- [x] Node.js 22+ — already installed (`node --version` shows 24.x)
- [x] git — already installed
- [x] `gh` CLI — already authenticated

You need the two repos already pushed to GitHub:

- ✓ <https://github.com/ott24x7-oss/watshop-license-server>
- ✓ <https://github.com/ott24x7-oss/watshop-studio>

Both done. Move on.

---

## Phase 1 — Deploy license server to Railway (10 min)

### 1.1 Connect Railway to GitHub

1. Open <https://railway.com/dashboard>.
2. Click **+ New Project**.
3. Click **Deploy from GitHub Repo**.
4. If it's your first time, Railway opens a popup asking to install its GitHub App. Click **Configure GitHub App** → choose **All repositories** (easier) or just `watshop-license-server`. Approve.
5. Back on Railway, search for **`watshop-license-server`** and click it.

Railway will immediately start a build. **The first deploy will fail** — that's expected (no env vars yet). Don't panic. Continue to step 1.2.

### 1.2 Add a persistent volume — CRITICAL

> ⚠️ **Skip this and you will lose every license you ever sell on the next redeploy.**

1. Click the service tile (named `watshop-license-server`).
2. Click the **Settings** tab.
3. Scroll to **Volumes** → click **+ Add Volume**.
4. Mount path: `/app/data`
5. Size: `1 GB` (plenty — each license is ~500 bytes).
6. Click **Add**.

Railway redeploys automatically.

### 1.3 Set environment variables

1. Same service → **Variables** tab.
2. Click **+ New Variable** for each row below. Paste the value, click **Add**.

| Variable | Value |
|---|---|
| `DATA_DIR` | `/app/data` |
| `NODE_ENV` | `production` |
| `JWT_TTL_DAYS` | `90` |
| `BOOTSTRAP_ADMIN_USERNAME` | `admin` |
| `BOOTSTRAP_ADMIN_PASSWORD` | (a strong temporary password — you'll change it then delete this var) |
| `SESSION_SECRET` | a 64-char random hex string |

To generate `SESSION_SECRET`, open a terminal and run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output, paste as the value.

After the last variable is added, Railway redeploys. Watch the **Deployments** tab — wait for the green checkmark (~1 min).

### 1.4 Generate a public domain

1. Service → **Settings** tab → scroll to **Networking** → **Public Networking** → click **Generate Domain**.
2. Railway gives you something like `watshop-license-server-production-abc1.up.railway.app`. Copy this URL — you'll need it.

### 1.5 First login

1. Open `https://<your-railway-domain>/admin` in your browser.
2. You should see the dark-themed login page with a green dot logo.
3. Log in with username `admin` and the password you set in `BOOTSTRAP_ADMIN_PASSWORD`.
4. You're now in the admin dashboard.

If you see a build/runtime error instead, jump to **Troubleshooting → Server won't start**.

---

## Phase 2 — Lock down the admin (3 min)

### 2.1 Change your password

1. Sidebar → **Account**.
2. Enter current password (the bootstrap one) and a new strong password (min 8 chars).
3. Click **Update password**.

### 2.2 Remove the bootstrap variable

1. Back to Railway → service → **Variables** tab.
2. Find `BOOTSTRAP_ADMIN_PASSWORD`. Click the three-dot menu → **Delete**.

> The bootstrap-from-env-var path only triggers when **no admin exists** in the database. Now that you're a real admin in the DB, this variable does nothing. Removing it is just hygiene — one fewer secret sitting around.

---

## Phase 3 — Connect the desktop app to your live server (10 min)

The `.exe` we have right now is hardcoded to a placeholder URL. It needs to be rebuilt with your real Railway URL and the matching public key.

### 3.1 Grab the production public key

1. Admin panel → sidebar → **Integration**.
2. You'll see a **Public key (RS256)** card with a `-----BEGIN PUBLIC KEY-----` block.
3. Click anywhere in the block to select, copy the entire thing including the `BEGIN`/`END` lines.

### 3.2 Edit the desktop app config

On your machine:

```bash
cd "C:/Users/diwak/Downloads/Compressed/SCREEN RECODER"
code electron/license-config.ts
```

Replace the `LICENSE_SERVER_URL` and `LICENSE_PUBLIC_KEY` constants:

```ts
export const LICENSE_SERVER_URL =
  process.env.LICENSE_SERVER_URL ?? "https://<your-railway-domain>";

export const LICENSE_BUY_URL =
  process.env.LICENSE_BUY_URL ?? "https://watshop.in/studio";

export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
<paste the entire production public key from the admin Integration page here>
-----END PUBLIC KEY-----`;
```

Save the file.

### 3.3 Commit, push, tag release

```bash
git add electron/license-config.ts
git commit -m "Wire desktop app to production license server"
git push

git tag v1.0.0
git push --tags
```

The `v1.0.0` tag triggers the **Build** GitHub Action. It will:
1. Run `npm ci`
2. Run `npm run build:win`
3. Produce a Windows installer (`Setup.exe`) and a portable zip
4. Attach both to a Release at `https://github.com/ott24x7-oss/watshop-studio/releases`

### 3.4 Watch the build

1. Open <https://github.com/ott24x7-oss/watshop-studio/actions>
2. Click the running workflow — it shows live logs.
3. Wait ~10 minutes (Electron + Vite + electron-builder packaging).
4. When it goes green, go to <https://github.com/ott24x7-oss/watshop-studio/releases>.
5. You should see a **v1.0.0** release with two files attached:
   - `WatShop Studio Setup 1.0.0.exe` — proper installer (works because GitHub runners run as admin, no symlink issue)
   - `WatShop-Studio-Portable-Win-x64-1.0.0.zip` — portable

Either one is what you ship to customers.

---

## Phase 4 — Test the full flow (5 min)

### 4.1 Create a test license

1. Admin panel → **+ New license**.
2. Email: your own email. Name: "Test". Plan: `lifetime`. Max devices: `1`.
3. Click **Generate key** → next page shows the `WATS-XXXX-XXXX-XXXX-XXXX` key. Copy it.

### 4.2 Install the desktop app

1. Download the installer from the Release page on GitHub.
2. Run it (Windows SmartScreen will warn — *More info → Run anyway*; this only goes away with code signing).
3. The installer wizard installs WatShop Studio.

### 4.3 Activate

1. Launch WatShop Studio. The license window appears.
2. Paste your test key. Click **Activate**.
3. The license window closes, the app loads. ✓

### 4.4 Verify the admin panel sees it

1. Admin panel → **Licenses** → click your test license.
2. **Activated devices** section should show one row with your machine name + ID + activation timestamp.

### 4.5 Test revocation

1. In the admin license detail page, scroll to **Danger zone** → click **Revoke**.
2. Run WatShop Studio normally — it'll keep working in the cached-JWT window. To test the revocation kick-in fast, right-click the tray icon → **License → Sign out of this PC**, then relaunch.
3. License window appears. Paste the same revoked key → activation fails with "This license has been revoked."
4. Back in admin → **Restore** the license, try again, it activates fine.

If all four steps pass, **you are live**.

---

## Phase 5 — Selling (per customer)

1. Customer pays you (manual, on whatever platform you use).
2. Admin panel → **+ New license** → fill email + name → **Generate key**.
3. Copy the key.
4. Send the customer (via WhatsApp/email/wherever):
   - The link `https://github.com/ott24x7-oss/watshop-studio/releases/latest`
   - Their license key
5. Customer downloads the installer, runs, pastes key, done.

---

## Phase 6 — Optional: Custom domain (5 min)

### 6.1 In Railway

1. Service → Settings → Networking → Custom Domain → click **+ Custom Domain**.
2. Enter `licenses.watshop.in`.
3. Railway shows you a CNAME target like `xxx.up.railway.app`. Copy it.

### 6.2 In your DNS provider (Cloudflare/Namecheap/etc.)

Add a CNAME record:

```
Type:   CNAME
Name:   licenses
Target: xxx.up.railway.app   (the value Railway gave you)
Proxy:  off (gray cloud) — let Railway handle TLS
TTL:    Auto
```

Wait 1–5 minutes for propagation. Railway's UI will show "Ready" with HTTPS.

### 6.3 Update the desktop app

1. Edit `electron/license-config.ts` again — change the URL to `https://licenses.watshop.in`.
2. Commit, push, tag `v1.0.1`. CI builds a new release.

---

## Phase 7 — Backups (do this every couple weeks)

Your entire SaaS state is one file: `data/licenses.db` plus the RS256 keypair (`data/jwt-private.pem`, `data/jwt-public.pem`). Lose those and you lose everything.

### Option A — Railway shell (quickest)

```bash
# from your machine, with Railway CLI installed
railway login
railway link                 # pick the project
railway run --service watshop-license-server -- tar czf - /app/data > backup-$(date +%Y%m%d).tgz
```

### Option B — Manual

1. Railway service → **Data** tab (if shown for your plan) → click **Backup**.
2. Or use the volume snapshot feature if available.

Store these `.tgz` files somewhere safe (not the same Railway account). Restore with:

```bash
tar xzf backup-YYYYMMDD.tgz -C /
```

inside the Railway shell.

---

## Troubleshooting

### Server won't start (red deployment in Railway)

Click the failed deployment → check logs.

- **`Cannot find module 'node:sqlite'`** → Node version too old. Set `NODE_VERSION=22` in Variables and redeploy.
- **`EADDRINUSE`** → Another process bound to the port. Restart the service.
- **`SQLITE_CANTOPEN`** → Volume not mounted. Re-check Phase 1.2 — `DATA_DIR=/app/data` and a 1 GB volume mounted at `/app/data`.

### Admin login says "Invalid username or password"

- Double-check the username (`admin` by default).
- If you forgot the password and already deleted `BOOTSTRAP_ADMIN_PASSWORD`: connect to the Railway shell and run:
  ```bash
  cd /app
  node -e "
  const Database = require('node:sqlite').DatabaseSync;
  const bcrypt = require('bcryptjs');
  const db = new Database('/app/data/licenses.db');
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(bcrypt.hashSync('NewTempPass123', 12), 'admin');
  console.log('done');
  "
  ```

### Desktop app says "Cannot reach the license server"

- Check `LICENSE_SERVER_URL` in `electron/license-config.ts` matches your Railway domain.
- Test from your browser: `https://<your-domain>/healthz` should return `{"ok":true,...}`.
- If browser works but app doesn't: rebuild the .exe (the URL is baked in at build time).

### Desktop app says "Activation succeeded but the response signature is invalid"

The `LICENSE_PUBLIC_KEY` in `electron/license-config.ts` doesn't match the server's actual public key.

- Re-copy the key from `/admin/integration`.
- Make sure you copy the **entire** block including `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines, no extra whitespace at the start of each line.
- Rebuild the .exe.

### "Device limit reached" when activating on a customer's PC

The customer probably already activated on a different PC and doesn't realize it. In the admin license detail page, find the row in the **Activated devices** table → click **Remove** to free the slot. Customer can now activate on the new PC.

### Customer's antivirus quarantines `WatShop Studio.exe`

The `.exe` isn't code-signed. Options:
- Tell the customer to add an exception for the install folder. Annoying but works.
- Buy a code-signing certificate ($200/yr for OV, ~$400/yr for EV). EV removes the SmartScreen warning instantly.

---

## What's hardcoded vs configurable

| Setting | Where it lives | Change requires |
|---|---|---|
| Server URL | `electron/license-config.ts` → `LICENSE_SERVER_URL` | Rebuild .exe (push tag) |
| RS256 public key | `electron/license-config.ts` → `LICENSE_PUBLIC_KEY` | Rebuild .exe (push tag) |
| Buy-license URL | `electron/license-config.ts` → `LICENSE_BUY_URL` | Rebuild .exe (push tag) |
| Heartbeat interval | `electron/license-config.ts` → `LICENSE_HEARTBEAT_INTERVAL_MS` | Rebuild .exe (push tag) |
| JWT validity | Server env var `JWT_TTL_DAYS` | Restart Railway service |
| Brand colors | `src/index.css` + `tailwind.config.cjs` | Rebuild .exe (push tag) |
| App name in window title | `electron/windows.ts` + `package.json` | Rebuild .exe |
| App icon | `icons/icons/win/icon.ico` | Rebuild .exe |
| Admin login URL path | `src/admin.ts` (`/login`, `/`) | Edit + redeploy server |

---

## Cost estimate

| Service | Cost |
|---|---|
| Railway hobby plan | $5/mo (covers ~500 MB RAM, 0.5 GB volume) — generous for thousands of licenses |
| GitHub | Free |
| Cloudflare DNS | Free |
| (Later) Code-signing OV cert | ~$200/yr |

For a few hundred customers, you'll be paying ~$5/month total.

---

## Done.

If anything breaks during deploy, paste the error into Claude and ask. Most issues are env-var typos, missing volume, or a copy-paste error in the public key.
