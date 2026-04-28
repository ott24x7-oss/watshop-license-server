import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { adminRoutes } from "./admin.js";
import { apiRoutes } from "./api.js";
import { countAdmins, createAdmin, purgeExpiredSessions } from "./auth.js";
import { migrate } from "./db.js";
import { ensureKeys } from "./jwt.js";

async function bootstrap() {
	migrate();
	await ensureKeys();
	purgeExpiredSessions();

	if (countAdmins() === 0) {
		const u = process.env.BOOTSTRAP_ADMIN_USERNAME;
		const p = process.env.BOOTSTRAP_ADMIN_PASSWORD;
		if (u && p) {
			createAdmin(u, p);
			console.log(`[bootstrap] Created initial admin user '${u}'.`);
			console.log("[bootstrap] Remove BOOTSTRAP_ADMIN_PASSWORD from env after first login.");
		} else {
			console.warn("⚠  No admin users exist. Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD in .env, or run `npm run setup`.");
		}
	}
}

const app = new Hono();
app.use("*", logger());

app.get("/", (c) => c.redirect("/admin"));
app.get("/healthz", (c) => c.json({ ok: true, ts: Date.now() }));

app.route("/api", apiRoutes);
app.route("/admin", adminRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
	console.error("[error]", err);
	return c.json({ error: "internal_error" }, 500);
});

const port = Number(process.env.PORT ?? 3000);

await bootstrap();

serve({ fetch: app.fetch, port }, (info) => {
	console.log(`\n🟢 WatShop License Server`);
	console.log(`   Admin panel:  http://localhost:${info.port}/admin`);
	console.log(`   Public API:   http://localhost:${info.port}/api`);
	console.log(`   Health:       http://localhost:${info.port}/healthz\n`);
});
