/**
 * Interactive first-time setup:
 *   - Run migrations
 *   - Generate RS256 keypair (if missing)
 *   - Prompt for an admin username + password
 *
 * Usage:  npm run setup
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { countAdmins, createAdmin } from "../src/auth.js";
import { migrate } from "../src/db.js";
import { ensureKeys } from "../src/jwt.js";

const rl = createInterface({ input, output });

function ask(prompt: string): Promise<string> {
	return rl.question(prompt);
}

async function askPassword(prompt: string): Promise<string> {
	process.stdout.write(prompt);
	return new Promise((resolve) => {
		const old = (input as any).isRaw;
		(input as any).setRawMode?.(true);
		let buf = "";
		const onData = (data: Buffer) => {
			const ch = data.toString("utf8");
			if (ch === "\n" || ch === "\r" || ch === "") {
				(input as any).setRawMode?.(old);
				input.removeListener("data", onData);
				process.stdout.write("\n");
				resolve(buf);
			} else if (ch === "") {
				process.exit(1);
			} else if (ch === "") {
				buf = buf.slice(0, -1);
			} else {
				buf += ch;
				process.stdout.write("*");
			}
		};
		input.on("data", onData);
	});
}

async function main() {
	console.log("\nWatShop License Server — first-time setup\n");

	migrate();
	console.log("✓ Database migrated");

	await ensureKeys();
	console.log("✓ RS256 keypair ready (data/jwt-private.pem, data/jwt-public.pem)");

	if (countAdmins() > 0) {
		console.log("\n⚠  At least one admin user already exists. Skipping admin creation.");
		console.log("   To reset, delete data/licenses.db and re-run.");
		rl.close();
		return;
	}

	const username = (await ask("Admin username: ")).trim();
	if (!username) {
		console.error("Username is required.");
		process.exit(1);
	}
	const password = await askPassword("Admin password (min 8 chars): ");
	if (password.length < 8) {
		console.error("Password must be at least 8 characters.");
		process.exit(1);
	}
	const confirm = await askPassword("Confirm password: ");
	if (confirm !== password) {
		console.error("Passwords don't match.");
		process.exit(1);
	}
	createAdmin(username, password);
	console.log(`\n✓ Admin '${username}' created`);
	console.log("\nDone! Run `npm run dev` and open http://localhost:3000/admin\n");

	rl.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
