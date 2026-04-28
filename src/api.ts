import { Hono } from "hono";
import { type Device, type License, db } from "./db.js";
import { signLicenseJWT, verifyLicenseJWT } from "./jwt.js";
import { isValidKeyFormat, normalizeKey } from "./keys.js";

const JWT_TTL_DAYS = parseInt(process.env.JWT_TTL_DAYS ?? "90", 10);

export const apiRoutes = new Hono();

function logEvent(licenseId: number | null, machineId: string | null, ip: string | null, event: string, reason: string) {
	db.prepare(`
		INSERT INTO activation_logs (license_id, machine_id, ip, event, reason, created_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(licenseId, machineId, ip, event, reason, Date.now());
}

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string | null {
	return (
		c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		c.req.header("cf-connecting-ip") ??
		c.req.header("x-real-ip") ??
		null
	);
}

const FEATURES_ALL = {
	export_4k: true,
	camera_overlay: true,
	annotations: true,
	zoom: true,
	custom_fonts: true,
	gif_export: true,
};

// ─── POST /api/activate ─────────────────────────────────────────────────
// Body: { key, machineId, machineName?, os?, appVersion? }
// Returns: { token, expiresAt, plan, features } | error

apiRoutes.post("/activate", async (c) => {
	const ip = clientIp(c);
	let body: any;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "invalid_json" }, 400);
	}

	const rawKey = String(body?.key ?? "").trim();
	const key = normalizeKey(rawKey);
	const machineId = String(body?.machineId ?? "").trim();
	const machineName = body?.machineName ? String(body.machineName).slice(0, 200) : null;
	const os = body?.os ? String(body.os).slice(0, 50) : null;
	const appVersion = body?.appVersion ? String(body.appVersion).slice(0, 50) : null;

	if (!key || !isValidKeyFormat(key)) {
		logEvent(null, machineId || null, ip, "activate_failed", "invalid_key_format");
		return c.json({ error: "invalid_key" }, 400);
	}
	if (!machineId || machineId.length < 8 || machineId.length > 200) {
		logEvent(null, machineId || null, ip, "activate_failed", "invalid_machine_id");
		return c.json({ error: "invalid_machine_id" }, 400);
	}

	const license = db.prepare("SELECT * FROM licenses WHERE key = ?").get(key) as License | undefined;
	if (!license) {
		logEvent(null, machineId, ip, "activate_failed", `unknown_key:${key}`);
		return c.json({ error: "unknown_key" }, 404);
	}
	if (license.status !== "active") {
		logEvent(license.id, machineId, ip, "activate_failed", "license_revoked");
		return c.json({ error: "license_revoked" }, 403);
	}

	// Look up existing device for this license + machine
	let device = db
		.prepare("SELECT * FROM devices WHERE license_id = ? AND machine_id = ?")
		.get(license.id, machineId) as Device | undefined;

	if (device) {
		// Re-activation on the same PC. If it was 'removed', re-activate (counts toward limit).
		if (device.status === "removed") {
			const activeCount = (db.prepare("SELECT COUNT(*) n FROM devices WHERE license_id = ? AND status = 'active'").get(license.id) as { n: number }).n;
			if (activeCount >= license.max_devices) {
				logEvent(license.id, machineId, ip, "activate_failed", "device_limit_reached");
				return c.json({ error: "device_limit_reached", maxDevices: license.max_devices }, 403);
			}
			db.prepare("UPDATE devices SET status='active', activated_at=?, last_heartbeat_at=?, machine_name=?, os=?, app_version=? WHERE id=?")
				.run(Date.now(), Date.now(), machineName, os, appVersion, device.id);
		} else {
			// Already active — just refresh metadata + JWT
			db.prepare("UPDATE devices SET last_heartbeat_at=?, machine_name=?, os=?, app_version=? WHERE id=?")
				.run(Date.now(), machineName ?? device.machine_name, os ?? device.os, appVersion ?? device.app_version, device.id);
		}
		device = db.prepare("SELECT * FROM devices WHERE id=?").get(device.id) as Device;
	} else {
		// New device. Check the device-limit.
		const activeCount = (db.prepare("SELECT COUNT(*) n FROM devices WHERE license_id = ? AND status = 'active'").get(license.id) as { n: number }).n;
		if (activeCount >= license.max_devices) {
			logEvent(license.id, machineId, ip, "activate_failed", "device_limit_reached");
			return c.json(
				{
					error: "device_limit_reached",
					maxDevices: license.max_devices,
					hint: "This license is already in use on another PC. Ask the seller to release the old device first.",
				},
				403,
			);
		}
		const info = db
			.prepare(`
				INSERT INTO devices (license_id, machine_id, machine_name, os, app_version, activated_at, last_heartbeat_at, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
			`)
			.run(license.id, machineId, machineName, os, appVersion, Date.now(), Date.now());
		device = db.prepare("SELECT * FROM devices WHERE id=?").get(Number(info.lastInsertRowid)) as Device;
	}

	const features = parseFeatures(license);
	const token = await signLicenseJWT(
		{
			sub: String(license.id),
			licenseKey: license.key,
			deviceId: device.id,
			machineId,
			plan: license.plan,
			features,
		},
		JWT_TTL_DAYS,
	);

	logEvent(license.id, machineId, ip, "activate_success", `device_id=${device.id}`);

	return c.json({
		token,
		expiresAt: Date.now() + JWT_TTL_DAYS * 24 * 60 * 60 * 1000,
		plan: license.plan,
		features,
		licenseKey: license.key,
		deviceId: device.id,
	});
});

// ─── POST /api/heartbeat ────────────────────────────────────────────────
// Authorization: Bearer <jwt>
// Returns: { valid: true, refreshed?: boolean, token?, expiresAt?, plan?, features? } | error

apiRoutes.post("/heartbeat", async (c) => {
	const ip = clientIp(c);
	const auth = c.req.header("authorization") ?? "";
	const m = /^Bearer\s+(.+)$/.exec(auth);
	if (!m) return c.json({ error: "missing_token" }, 401);
	const token = m[1];

	let payload: Awaited<ReturnType<typeof verifyLicenseJWT>>;
	try {
		payload = await verifyLicenseJWT(token);
	} catch (err: any) {
		const reason = err?.code ?? err?.message ?? "verify_failed";
		logEvent(null, null, ip, "heartbeat_failed", String(reason));
		return c.json({ error: "invalid_token", reason: String(reason) }, 401);
	}

	const license = db.prepare("SELECT * FROM licenses WHERE id = ?").get(parseInt(payload.sub, 10)) as License | undefined;
	if (!license) {
		logEvent(null, payload.machineId, ip, "heartbeat_failed", "license_missing");
		return c.json({ error: "license_missing" }, 403);
	}
	if (license.status !== "active") {
		logEvent(license.id, payload.machineId, ip, "heartbeat_failed", "license_revoked");
		return c.json({ error: "license_revoked" }, 403);
	}

	const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(payload.deviceId) as Device | undefined;
	if (!device || device.status !== "active") {
		logEvent(license.id, payload.machineId, ip, "heartbeat_failed", "device_not_active");
		return c.json({ error: "device_not_active" }, 403);
	}
	if (device.machine_id !== payload.machineId) {
		logEvent(license.id, payload.machineId, ip, "heartbeat_failed", "machine_mismatch");
		return c.json({ error: "machine_mismatch" }, 403);
	}

	db.prepare("UPDATE devices SET last_heartbeat_at = ? WHERE id = ?").run(Date.now(), device.id);

	// Refresh the JWT if it's within 14 days of expiry, so the app keeps a long lease.
	const halfLife = Date.now() + 14 * 24 * 60 * 60 * 1000;
	const expMs = payload.exp * 1000;
	let refreshed = false;
	let newToken: string | undefined;
	let newExpiresAt: number | undefined;
	if (expMs < halfLife) {
		const features = parseFeatures(license);
		newToken = await signLicenseJWT(
			{
				sub: String(license.id),
				licenseKey: license.key,
				deviceId: device.id,
				machineId: device.machine_id,
				plan: license.plan,
				features,
			},
			JWT_TTL_DAYS,
		);
		newExpiresAt = Date.now() + JWT_TTL_DAYS * 24 * 60 * 60 * 1000;
		refreshed = true;
	}

	logEvent(license.id, payload.machineId, ip, "heartbeat_ok", refreshed ? "refreshed" : "ok");

	return c.json({
		valid: true,
		refreshed,
		token: newToken,
		expiresAt: newExpiresAt,
		plan: license.plan,
		features: parseFeatures(license),
	});
});

// ─── POST /api/deactivate ───────────────────────────────────────────────
// Releases the device so the customer can move to a new PC.

apiRoutes.post("/deactivate", async (c) => {
	const ip = clientIp(c);
	const auth = c.req.header("authorization") ?? "";
	const m = /^Bearer\s+(.+)$/.exec(auth);
	if (!m) return c.json({ error: "missing_token" }, 401);

	let payload: Awaited<ReturnType<typeof verifyLicenseJWT>>;
	try {
		payload = await verifyLicenseJWT(m[1]);
	} catch {
		return c.json({ error: "invalid_token" }, 401);
	}

	const device = db.prepare("SELECT * FROM devices WHERE id = ?").get(payload.deviceId) as Device | undefined;
	if (!device) return c.json({ error: "device_missing" }, 404);

	db.prepare("UPDATE devices SET status='removed' WHERE id = ?").run(device.id);
	logEvent(device.license_id, device.machine_id, ip, "deactivate", "user_action");

	return c.json({ ok: true });
});

function parseFeatures(license: License): Record<string, unknown> {
	if (!license.features) return FEATURES_ALL;
	try {
		return { ...FEATURES_ALL, ...JSON.parse(license.features) };
	} catch {
		return FEATURES_ALL;
	}
}
