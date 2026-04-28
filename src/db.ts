import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, "licenses.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

export function migrate() {
	db.exec(`
		CREATE TABLE IF NOT EXISTS admin_users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL
		);

		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			admin_id INTEGER NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
		);

		CREATE TABLE IF NOT EXISTS licenses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			key TEXT UNIQUE NOT NULL,
			customer_email TEXT,
			customer_name TEXT,
			plan TEXT NOT NULL DEFAULT 'lifetime',
			max_devices INTEGER NOT NULL DEFAULT 1,
			features TEXT,
			notes TEXT,
			status TEXT NOT NULL DEFAULT 'active',
			created_at INTEGER NOT NULL,
			revoked_at INTEGER
		);

		CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(key);
		CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(customer_email);

		CREATE TABLE IF NOT EXISTS devices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			license_id INTEGER NOT NULL,
			machine_id TEXT NOT NULL,
			machine_name TEXT,
			os TEXT,
			app_version TEXT,
			activated_at INTEGER NOT NULL,
			last_heartbeat_at INTEGER,
			status TEXT NOT NULL DEFAULT 'active',
			FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
			UNIQUE(license_id, machine_id)
		);

		CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_id);

		CREATE TABLE IF NOT EXISTS activation_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			license_id INTEGER,
			machine_id TEXT,
			ip TEXT,
			event TEXT NOT NULL,
			reason TEXT,
			created_at INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_logs_license ON activation_logs(license_id);
		CREATE INDEX IF NOT EXISTS idx_logs_created ON activation_logs(created_at);
	`);
}

export type License = {
	id: number;
	key: string;
	customer_email: string | null;
	customer_name: string | null;
	plan: string;
	max_devices: number;
	features: string | null;
	notes: string | null;
	status: "active" | "revoked";
	created_at: number;
	revoked_at: number | null;
};

export type Device = {
	id: number;
	license_id: number;
	machine_id: string;
	machine_name: string | null;
	os: string | null;
	app_version: string | null;
	activated_at: number;
	last_heartbeat_at: number | null;
	status: "active" | "removed";
};

export type AdminUser = {
	id: number;
	username: string;
	password_hash: string;
	created_at: number;
};
