import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { type AdminUser, db } from "./db.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
	return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
	return bcrypt.compareSync(password, hash);
}

export function createAdmin(username: string, password: string): AdminUser {
	const hash = hashPassword(password);
	const info = db
		.prepare("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)")
		.run(username, hash, Date.now());
	return findAdminById(Number(info.lastInsertRowid))!;
}

export function findAdmin(username: string): AdminUser | undefined {
	return db.prepare("SELECT * FROM admin_users WHERE username = ?").get(username) as AdminUser | undefined;
}

export function findAdminById(id: number): AdminUser | undefined {
	return db.prepare("SELECT * FROM admin_users WHERE id = ?").get(id) as AdminUser | undefined;
}

export function countAdmins(): number {
	return (db.prepare("SELECT COUNT(*) as n FROM admin_users").get() as { n: number }).n;
}

export function changePassword(adminId: number, newPassword: string): void {
	db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?")
		.run(hashPassword(newPassword), adminId);
}

export type Session = {
	id: string;
	admin_id: number;
	created_at: number;
	expires_at: number;
};

export function createSession(adminId: number): Session {
	const id = randomBytes(32).toString("hex");
	const now = Date.now();
	const expiresAt = now + SESSION_TTL_MS;
	db.prepare("INSERT INTO sessions (id, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
		.run(id, adminId, now, expiresAt);
	return { id, admin_id: adminId, created_at: now, expires_at: expiresAt };
}

export function getSession(id: string): Session | undefined {
	return db
		.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?")
		.get(id, Date.now()) as Session | undefined;
}

export function deleteSession(id: string): void {
	db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function purgeExpiredSessions(): void {
	db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}
