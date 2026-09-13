import { constantTimeEqual } from "#/constant-time.ts";

const encoder = new TextEncoder();
const PACK_MAC_PREFIX = "Bearer hakase-pack.";

function bytesToHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | undefined {
	if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/iu.test(hex)) {
		return undefined;
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
}

export async function packMac(args: {
	dispatchId: string;
	pem: string;
}): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(args.pem),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(args.dispatchId),
	);
	return bytesToHex(new Uint8Array(signature));
}

export function packMacHeader(mac: string): string {
	return `${PACK_MAC_PREFIX}${mac}`;
}

export function packMacFromAuthorization(
	authorization: string | null | undefined,
): string | undefined {
	if (authorization === null || authorization === undefined) {
		return undefined;
	}
	if (!authorization.startsWith(PACK_MAC_PREFIX)) {
		return undefined;
	}
	const mac = authorization.slice(PACK_MAC_PREFIX.length);
	return mac.length === 0 ? undefined : mac;
}

export function verifyPackMac(args: {
	expected: string;
	mac: string | undefined;
}): boolean {
	if (args.mac === undefined) {
		return false;
	}
	const presented = hexToBytes(args.mac);
	const expected = hexToBytes(args.expected);
	if (presented === undefined || expected === undefined) {
		return false;
	}
	return constantTimeEqual(presented, expected);
}

export async function authorizePackMac(args: {
	authorization: string | null | undefined;
	dispatchId: string;
	pem: string | undefined;
}): Promise<{ kind: "ok" } | { kind: "unauthorized" } | { kind: "unset" }> {
	if (args.pem === undefined || args.pem.length === 0) {
		return { kind: "unset" };
	}
	const expected = await packMac({
		dispatchId: args.dispatchId,
		pem: args.pem,
	});
	const mac = packMacFromAuthorization(args.authorization);
	if (!verifyPackMac({ expected, mac })) {
		return { kind: "unauthorized" };
	}
	return { kind: "ok" };
}
