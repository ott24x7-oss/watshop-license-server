import fs from "node:fs";
import path from "node:path";
import {
	exportPKCS8,
	exportSPKI,
	generateKeyPair,
	importPKCS8,
	importSPKI,
	jwtVerify,
	SignJWT,
} from "jose";

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const PRIV_PATH = path.join(DATA_DIR, "jwt-private.pem");
const PUB_PATH = path.join(DATA_DIR, "jwt-public.pem");
const ISSUER = "watshop-studio";

export async function ensureKeys(): Promise<void> {
	if (fs.existsSync(PRIV_PATH) && fs.existsSync(PUB_PATH)) return;
	console.log("[jwt] Generating RS256 keypair…");
	fs.mkdirSync(DATA_DIR, { recursive: true });
	const { privateKey, publicKey } = await generateKeyPair("RS256", {
		modulusLength: 2048,
		extractable: true,
	});
	fs.writeFileSync(PRIV_PATH, await exportPKCS8(privateKey), { mode: 0o600 });
	fs.writeFileSync(PUB_PATH, await exportSPKI(publicKey));
	console.log(`[jwt] Wrote ${PRIV_PATH} and ${PUB_PATH}`);
}

export function readPublicKeyPem(): string {
	return fs.readFileSync(PUB_PATH, "utf8");
}

async function getPrivateKey() {
	return importPKCS8(fs.readFileSync(PRIV_PATH, "utf8"), "RS256");
}

async function getPublicKey() {
	return importSPKI(fs.readFileSync(PUB_PATH, "utf8"), "RS256");
}

export type LicensePayload = {
	sub: string;
	licenseKey: string;
	deviceId: number;
	machineId: string;
	plan: string;
	features: Record<string, unknown>;
};

export async function signLicenseJWT(payload: LicensePayload, ttlDays: number): Promise<string> {
	const key = await getPrivateKey();
	return await new SignJWT({ ...payload })
		.setProtectedHeader({ alg: "RS256" })
		.setIssuedAt()
		.setIssuer(ISSUER)
		.setSubject(payload.sub)
		.setExpirationTime(`${ttlDays}d`)
		.sign(key);
}

export async function verifyLicenseJWT(token: string): Promise<LicensePayload & { exp: number; iat: number }> {
	const key = await getPublicKey();
	const { payload } = await jwtVerify(token, key, { issuer: ISSUER });
	return payload as unknown as LicensePayload & { exp: number; iat: number };
}
