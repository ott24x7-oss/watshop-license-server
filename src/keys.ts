import { randomBytes } from "node:crypto";

// No I, L, O, 0, 1 to avoid visual ambiguity when typing.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateLicenseKey(prefix = "WATS"): string {
	const buf = randomBytes(16);
	const groups: string[] = [];
	for (let g = 0; g < 4; g++) {
		let group = "";
		for (let i = 0; i < 4; i++) {
			group += ALPHABET[buf[g * 4 + i] % ALPHABET.length];
		}
		groups.push(group);
	}
	return `${prefix}-${groups.join("-")}`;
}

const KEY_RE = /^[A-Z]{2,8}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export function isValidKeyFormat(key: string): boolean {
	return KEY_RE.test(key);
}

export function normalizeKey(key: string): string {
	return key.trim().toUpperCase();
}
