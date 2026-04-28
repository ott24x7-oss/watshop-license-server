import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
	changePassword,
	createSession,
	deleteSession,
	findAdmin,
	findAdminById,
	getSession,
	verifyPassword,
} from "./auth.js";
import { type Device, type License, db } from "./db.js";
import { readPublicKeyPem } from "./jwt.js";
import { generateLicenseKey } from "./keys.js";
import { h, layout, loginPage } from "./views.js";

const SESSION_COOKIE = "ws_admin_sid";
const COOKIE_OPTS = {
	httpOnly: true,
	sameSite: "Lax" as const,
	secure: process.env.NODE_ENV === "production",
	path: "/",
};

type AdminContext = { adminId: number };

export const adminRoutes = new Hono<{ Variables: AdminContext }>();

// Auth gate for everything under /admin (except /admin/login)
adminRoutes.use("/*", async (c, next) => {
	const isLoginRoute = c.req.path === "/admin/login" || c.req.path === "/admin/logout";
	if (isLoginRoute) return next();

	const sid = getCookie(c, SESSION_COOKIE);
	if (!sid) return c.redirect("/admin/login");
	const sess = getSession(sid);
	if (!sess) {
		deleteCookie(c, SESSION_COOKIE, COOKIE_OPTS);
		return c.redirect("/admin/login");
	}
	c.set("adminId", sess.admin_id);
	await next();
});

// ─── Auth ────────────────────────────────────────────────────────────────

adminRoutes.get("/login", (c) => {
	const sid = getCookie(c, SESSION_COOKIE);
	if (sid && getSession(sid)) return c.redirect("/admin");
	return c.html(loginPage());
});

adminRoutes.post("/login", async (c) => {
	const form = await c.req.parseBody();
	const username = String(form.username ?? "").trim();
	const password = String(form.password ?? "");
	const admin = findAdmin(username);
	if (!admin || !verifyPassword(password, admin.password_hash)) {
		return c.html(loginPage("Invalid username or password"), 401);
	}
	const sess = createSession(admin.id);
	setCookie(c, SESSION_COOKIE, sess.id, {
		...COOKIE_OPTS,
		expires: new Date(sess.expires_at),
	});
	return c.redirect("/admin");
});

adminRoutes.post("/logout", (c) => {
	const sid = getCookie(c, SESSION_COOKIE);
	if (sid) deleteSession(sid);
	deleteCookie(c, SESSION_COOKIE, COOKIE_OPTS);
	return c.redirect("/admin/login");
});

// ─── Dashboard ───────────────────────────────────────────────────────────

adminRoutes.get("/", (c) => {
	const totalLicenses = (db.prepare("SELECT COUNT(*) n FROM licenses").get() as { n: number }).n;
	const activeLicenses = (db.prepare("SELECT COUNT(*) n FROM licenses WHERE status='active'").get() as { n: number }).n;
	const revokedLicenses = (db.prepare("SELECT COUNT(*) n FROM licenses WHERE status='revoked'").get() as { n: number }).n;
	const activeDevices = (db.prepare("SELECT COUNT(*) n FROM devices WHERE status='active'").get() as { n: number }).n;

	const recent = db
		.prepare(`
			SELECT l.id, l.key, l.customer_email, l.customer_name, l.status, l.created_at,
				(SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status='active') AS device_count
			FROM licenses l
			ORDER BY l.created_at DESC
			LIMIT 8
		`)
		.all() as Array<License & { device_count: number }>;

	const body = `
<h1>Dashboard</h1>
<p class="subtitle">Lifetime licenses, 1 device per key.</p>

<div class="stats">
	<div class="stat-card"><div class="label">Total licenses</div><div class="value">${totalLicenses}</div></div>
	<div class="stat-card"><div class="label">Active</div><div class="value green">${activeLicenses}</div></div>
	<div class="stat-card"><div class="label">Revoked</div><div class="value red">${revokedLicenses}</div></div>
	<div class="stat-card"><div class="label">Devices online</div><div class="value">${activeDevices}</div></div>
</div>

<div class="toolbar" style="margin-top:32px">
	<h2 style="margin:0">Recent licenses</h2>
	<a href="/admin/licenses/new"><button class="primary">+ New license</button></a>
</div>

<div class="card" style="padding:0">
	<table>
		<thead><tr>
			<th>Key</th><th>Customer</th><th>Status</th><th>Devices</th><th>Created</th>
		</tr></thead>
		<tbody>
			${recent.length === 0 ? `<tr><td colspan="5" style="padding:32px; text-align:center; color:var(--slate)">No licenses yet. Create your first one.</td></tr>` : ""}
			${recent
				.map(
					(l) => `<tr onclick="location='/admin/licenses/${l.id}'" style="cursor:pointer">
				<td class="mono">${h(l.key)}</td>
				<td>${h(l.customer_email ?? "—")}</td>
				<td><span class="badge ${h(l.status)}">${h(l.status)}</span></td>
				<td>${l.device_count} / 1</td>
				<td class="muted">${new Date(l.created_at).toLocaleDateString()}</td>
			</tr>`,
				)
				.join("")}
		</tbody>
	</table>
</div>
`;
	return c.html(layout({ title: "Dashboard", body, active: "dashboard" }));
});

// ─── Licenses list ───────────────────────────────────────────────────────

adminRoutes.get("/licenses", (c) => {
	const q = c.req.query("q")?.trim() ?? "";
	const status = c.req.query("status") ?? "";
	const filters: string[] = [];
	const params: unknown[] = [];
	if (q) {
		filters.push("(l.key LIKE ? OR l.customer_email LIKE ? OR l.customer_name LIKE ?)");
		params.push(`%${q}%`, `%${q}%`, `%${q}%`);
	}
	if (status) {
		filters.push("l.status = ?");
		params.push(status);
	}
	const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

	const rows = db
		.prepare(`
			SELECT l.*,
				(SELECT COUNT(*) FROM devices d WHERE d.license_id = l.id AND d.status='active') AS device_count
			FROM licenses l ${where}
			ORDER BY l.created_at DESC
			LIMIT 200
		`)
		.all(...params) as Array<License & { device_count: number }>;

	const flashCookie = getCookie(c, "ws_flash");
	let flash: { kind: "success" | "error"; text: string } | null = null;
	if (flashCookie) {
		try {
			flash = JSON.parse(decodeURIComponent(flashCookie));
		} catch {}
		deleteCookie(c, "ws_flash", { path: "/" });
	}

	const body = `
<div class="toolbar">
	<div>
		<h1>Licenses</h1>
		<p class="subtitle">${rows.length} shown</p>
	</div>
	<a href="/admin/licenses/new"><button class="primary">+ New license</button></a>
</div>

<form method="get" class="card" style="display:flex; gap:8px; align-items:center;">
	<input type="text" name="q" value="${h(q)}" placeholder="Search by key, email, or name" style="flex:1">
	<select name="status" style="width:180px">
		<option value="">All statuses</option>
		<option value="active" ${status === "active" ? "selected" : ""}>Active</option>
		<option value="revoked" ${status === "revoked" ? "selected" : ""}>Revoked</option>
	</select>
	<button type="submit" class="ghost">Filter</button>
</form>

<div class="card" style="padding:0">
	<table>
		<thead><tr>
			<th>Key</th><th>Customer</th><th>Plan</th><th>Status</th><th>Devices</th><th>Created</th>
		</tr></thead>
		<tbody>
			${rows.length === 0 ? `<tr><td colspan="6" style="padding:32px; text-align:center; color:var(--slate)">No licenses match.</td></tr>` : ""}
			${rows
				.map(
					(l) => `<tr onclick="location='/admin/licenses/${l.id}'" style="cursor:pointer">
				<td class="mono">${h(l.key)}</td>
				<td>${h(l.customer_name || l.customer_email || "—")}<div class="muted">${h(l.customer_email ?? "")}</div></td>
				<td>${h(l.plan)}</td>
				<td><span class="badge ${h(l.status)}">${h(l.status)}</span></td>
				<td>${l.device_count} / ${l.max_devices}</td>
				<td class="muted">${new Date(l.created_at).toLocaleDateString()}</td>
			</tr>`,
				)
				.join("")}
		</tbody>
	</table>
</div>
`;
	return c.html(layout({ title: "Licenses", body, active: "licenses", flash }));
});

// ─── Create license ──────────────────────────────────────────────────────

adminRoutes.get("/licenses/new", (c) => {
	const body = `
<h1>New license</h1>
<p class="subtitle">Generate a lifetime license key for one PC.</p>

<form method="post" action="/admin/licenses" class="card">
	<div class="row"><label>Customer email</label><input type="email" name="customer_email" placeholder="customer@example.com"></div>
	<div class="row"><label>Customer name</label><input type="text" name="customer_name" placeholder="Optional"></div>
	<div class="row"><label>Plan</label><input type="text" name="plan" value="lifetime"></div>
	<div class="row"><label>Max devices</label><input type="number" name="max_devices" value="1" min="1" max="10"></div>
	<div class="row"><label>Notes</label><textarea name="notes" placeholder="Internal notes (e.g. Razorpay payment ID, source, ...)"></textarea></div>
	<div class="row" style="margin-top:16px"><label></label>
		<button type="submit" class="primary">Generate key</button>
		<a href="/admin/licenses" style="margin-left:8px"><button type="button" class="ghost">Cancel</button></a>
	</div>
</form>
`;
	return c.html(layout({ title: "New license", body, active: "new-license" }));
});

adminRoutes.post("/licenses", async (c) => {
	const form = await c.req.parseBody();
	const customer_email = String(form.customer_email ?? "").trim() || null;
	const customer_name = String(form.customer_name ?? "").trim() || null;
	const plan = String(form.plan ?? "lifetime").trim() || "lifetime";
	const max_devices = Math.max(1, Math.min(10, parseInt(String(form.max_devices ?? "1"), 10) || 1));
	const notes = String(form.notes ?? "").trim() || null;

	let key = generateLicenseKey();
	// retry on (extremely unlikely) collision
	while (db.prepare("SELECT 1 FROM licenses WHERE key = ?").get(key)) {
		key = generateLicenseKey();
	}

	const info = db
		.prepare(`
			INSERT INTO licenses (key, customer_email, customer_name, plan, max_devices, notes, status, created_at)
			VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
		`)
		.run(key, customer_email, customer_name, plan, max_devices, notes, Date.now());

	return c.redirect(`/admin/licenses/${info.lastInsertRowid}?created=1`);
});

// ─── License detail ──────────────────────────────────────────────────────

adminRoutes.get("/licenses/:id", (c) => {
	const id = parseInt(c.req.param("id"), 10);
	if (!Number.isFinite(id)) return c.text("Invalid id", 400);
	const license = db.prepare("SELECT * FROM licenses WHERE id = ?").get(id) as License | undefined;
	if (!license) return c.text("Not found", 404);

	const devices = db
		.prepare("SELECT * FROM devices WHERE license_id = ? ORDER BY activated_at DESC")
		.all(id) as Device[];

	const logs = db
		.prepare("SELECT * FROM activation_logs WHERE license_id = ? ORDER BY created_at DESC LIMIT 20")
		.all(id) as Array<{ id: number; event: string; reason: string | null; ip: string | null; machine_id: string | null; created_at: number }>;

	const justCreated = c.req.query("created") === "1";

	const body = `
<a href="/admin/licenses" class="muted" style="display:inline-block; margin-bottom:12px">&larr; Back to licenses</a>

${justCreated ? `<div class="flash success">License created. Send the customer their setup file along with this key.</div>` : ""}

<div class="toolbar">
	<div>
		<h1>License #${license.id}</h1>
		<p class="subtitle">Created ${new Date(license.created_at).toLocaleString()}</p>
	</div>
	<div>
		<span class="badge ${h(license.status)}">${h(license.status)}</span>
	</div>
</div>

<div class="card">
	<div class="muted" style="margin-bottom:6px">License key (give this to the customer)</div>
	<div class="copy-row">
		<span style="flex:1">${h(license.key)}</span>
		<button onclick="navigator.clipboard.writeText('${h(license.key)}'); this.textContent='Copied!'">Copy</button>
	</div>
</div>

<div class="card">
	<h2 style="margin-top:0">Customer</h2>
	<div class="row"><label>Email</label><div>${h(license.customer_email ?? "—")}</div></div>
	<div class="row"><label>Name</label><div>${h(license.customer_name ?? "—")}</div></div>
	<div class="row"><label>Plan</label><div>${h(license.plan)}</div></div>
	<div class="row"><label>Max devices</label><div>${license.max_devices}</div></div>
	<div class="row"><label>Notes</label><div style="white-space:pre-wrap">${h(license.notes ?? "—")}</div></div>
</div>

<div class="card">
	<h2 style="margin-top:0">Activated devices (${devices.filter((d) => d.status === "active").length} / ${license.max_devices})</h2>
	${
		devices.length === 0
			? `<p class="muted">Nobody has activated this license yet.</p>`
			: `<table style="margin-top:8px">
		<thead><tr><th>Machine</th><th>Status</th><th>Activated</th><th>Last seen</th><th></th></tr></thead>
		<tbody>${devices
			.map(
				(d) => `<tr>
			<td>
				<div>${h(d.machine_name ?? "Unknown")}</div>
				<div class="muted mono">${h(d.machine_id.slice(0, 24))}…</div>
			</td>
			<td><span class="badge ${h(d.status)}">${h(d.status)}</span></td>
			<td class="muted">${new Date(d.activated_at).toLocaleString()}</td>
			<td class="muted">${d.last_heartbeat_at ? new Date(d.last_heartbeat_at).toLocaleString() : "—"}</td>
			<td>
				${
					d.status === "active"
						? `<form method="post" action="/admin/devices/${d.id}/remove" style="display:inline" onsubmit="return confirm('Remove this device? The customer can re-activate on a new PC.')">
					<button type="submit" class="ghost">Remove</button>
				</form>`
						: ""
				}
			</td>
		</tr>`,
			)
			.join("")}</tbody>
	</table>`
	}
</div>

<div class="card">
	<h2 style="margin-top:0">Activity log</h2>
	${
		logs.length === 0
			? `<p class="muted">No events yet.</p>`
			: `<table style="margin-top:8px">
		<thead><tr><th>When</th><th>Event</th><th>Detail</th><th>IP</th></tr></thead>
		<tbody>${logs
			.map(
				(l) => `<tr>
			<td class="muted">${new Date(l.created_at).toLocaleString()}</td>
			<td><code>${h(l.event)}</code></td>
			<td>${h(l.reason ?? "")}</td>
			<td class="muted mono">${h(l.ip ?? "—")}</td>
		</tr>`,
			)
			.join("")}</tbody>
	</table>`
	}
</div>

<div class="card" style="border-color: rgba(229,72,77,0.3)">
	<h2 style="margin-top:0; color: var(--danger)">Danger zone</h2>
	${
		license.status === "active"
			? `<p class="muted" style="margin-bottom:12px">Revoking this license will block all activated devices on next heartbeat. The key will stop working.</p>
			<form method="post" action="/admin/licenses/${license.id}/revoke" onsubmit="return confirm('Revoke this license? This cannot be undone from the UI.')">
				<button type="submit" class="danger">Revoke license</button>
			</form>`
			: `<p class="muted">License is revoked${license.revoked_at ? ` since ${new Date(license.revoked_at).toLocaleString()}` : ""}.</p>
			<form method="post" action="/admin/licenses/${license.id}/restore">
				<button type="submit" class="ghost">Restore (set back to active)</button>
			</form>`
	}
</div>
`;
	return c.html(layout({ title: `License ${license.key}`, body, active: "licenses" }));
});

adminRoutes.post("/licenses/:id/revoke", (c) => {
	const id = parseInt(c.req.param("id"), 10);
	db.prepare("UPDATE licenses SET status='revoked', revoked_at=? WHERE id=?").run(Date.now(), id);
	db.prepare("INSERT INTO activation_logs (license_id, event, reason, created_at) VALUES (?, 'revoked', 'admin action', ?)")
		.run(id, Date.now());
	return c.redirect(`/admin/licenses/${id}`);
});

adminRoutes.post("/licenses/:id/restore", (c) => {
	const id = parseInt(c.req.param("id"), 10);
	db.prepare("UPDATE licenses SET status='active', revoked_at=NULL WHERE id=?").run(id);
	db.prepare("INSERT INTO activation_logs (license_id, event, reason, created_at) VALUES (?, 'restored', 'admin action', ?)")
		.run(id, Date.now());
	return c.redirect(`/admin/licenses/${id}`);
});

adminRoutes.post("/devices/:id/remove", (c) => {
	const id = parseInt(c.req.param("id"), 10);
	const device = db.prepare("SELECT * FROM devices WHERE id=?").get(id) as Device | undefined;
	if (!device) return c.text("Not found", 404);
	db.prepare("UPDATE devices SET status='removed' WHERE id=?").run(id);
	db.prepare("INSERT INTO activation_logs (license_id, machine_id, event, reason, created_at) VALUES (?, ?, 'device_removed', 'admin action', ?)")
		.run(device.license_id, device.machine_id, Date.now());
	return c.redirect(`/admin/licenses/${device.license_id}`);
});

// ─── Integration page (shows the public key + endpoint URLs) ─────────────

adminRoutes.get("/integration", (c) => {
	const pem = readPublicKeyPem();
	const baseUrl = `${new URL(c.req.url).origin}`;

	const body = `
<h1>Desktop integration</h1>
<p class="subtitle">Embed these into the desktop app so it can verify and activate licenses.</p>

<div class="card">
	<h2 style="margin-top:0">Public key (RS256)</h2>
	<p class="muted" style="margin-bottom:8px">Bundle this in the Electron renderer. The app uses it to verify JWT signatures offline.</p>
	<pre style="background:rgba(0,0,0,0.3); padding:14px; border-radius:8px; overflow:auto; font-size:11px; line-height:1.5">${h(pem)}</pre>
</div>

<div class="card">
	<h2 style="margin-top:0">Activation endpoint</h2>
	<div class="copy-row"><span style="flex:1">POST ${h(baseUrl)}/api/activate</span></div>
	<pre style="background:rgba(0,0,0,0.3); padding:14px; border-radius:8px; margin-top:10px; overflow:auto; font-size:12px">{
  "key": "WATS-XXXX-XXXX-XXXX-XXXX",
  "machineId": "&lt;sha256 of os hostname + mac&gt;",
  "machineName": "DIWAK-PC",
  "os": "win32",
  "appVersion": "1.0.0"
}</pre>
	<p class="muted" style="margin-top:8px">Returns <code>{ token, expiresAt, plan, features }</code>. Store the token; verify it locally with the public key on every launch.</p>
</div>

<div class="card">
	<h2 style="margin-top:0">Heartbeat endpoint</h2>
	<div class="copy-row"><span style="flex:1">POST ${h(baseUrl)}/api/heartbeat</span></div>
	<p class="muted" style="margin-top:8px"><code>Authorization: Bearer &lt;jwt&gt;</code> — call once a week. If the license was revoked or device removed, returns 403 and the app should re-prompt for a key.</p>
</div>

<div class="card">
	<h2 style="margin-top:0">Health check</h2>
	<div class="copy-row"><span style="flex:1">GET ${h(baseUrl)}/healthz</span></div>
</div>
`;
	return c.html(layout({ title: "Integration", body, active: "integration" }));
});

// ─── Account ─────────────────────────────────────────────────────────────

adminRoutes.get("/account", (c) => {
	const adminId = c.get("adminId");
	const admin = findAdminById(adminId)!;

	const body = `
<h1>Account</h1>
<p class="subtitle">Signed in as <strong>${h(admin.username)}</strong></p>

<div class="card">
	<h2 style="margin-top:0">Change password</h2>
	<form method="post" action="/admin/account/password">
		<div class="row"><label>Current password</label><input type="password" name="current" required></div>
		<div class="row"><label>New password</label><input type="password" name="next" required minlength="8"></div>
		<div class="row" style="margin-top:8px"><label></label><button type="submit" class="primary">Update password</button></div>
	</form>
</div>
`;
	return c.html(layout({ title: "Account", body, active: "account" }));
});

adminRoutes.post("/account/password", async (c) => {
	const adminId = c.get("adminId");
	const admin = findAdminById(adminId)!;
	const form = await c.req.parseBody();
	const current = String(form.current ?? "");
	const next = String(form.next ?? "");
	if (!verifyPassword(current, admin.password_hash)) {
		setCookie(c, "ws_flash", encodeURIComponent(JSON.stringify({ kind: "error", text: "Current password is wrong." })), { path: "/", maxAge: 5 });
		return c.redirect("/admin/account");
	}
	if (next.length < 8) {
		setCookie(c, "ws_flash", encodeURIComponent(JSON.stringify({ kind: "error", text: "New password must be at least 8 characters." })), { path: "/", maxAge: 5 });
		return c.redirect("/admin/account");
	}
	changePassword(adminId, next);
	setCookie(c, "ws_flash", encodeURIComponent(JSON.stringify({ kind: "success", text: "Password updated." })), { path: "/", maxAge: 5 });
	return c.redirect("/admin/account");
});
