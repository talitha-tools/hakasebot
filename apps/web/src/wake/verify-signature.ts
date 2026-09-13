import { constantTimeEqual } from "@hakasebot/core/constant-time.ts";

const encoder = new TextEncoder();

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

export async function verifyGithubSignature(args: {
	rawBody: string;
	secret: string;
	signatureHeader: string | null | undefined;
}): Promise<boolean> {
	if (args.signatureHeader === null || args.signatureHeader === undefined) {
		return false;
	}
	const prefix = "sha256=";
	if (!args.signatureHeader.startsWith(prefix)) {
		return false;
	}
	const actual = hexToBytes(args.signatureHeader.slice(prefix.length));
	if (actual === undefined) {
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(args.secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const expected = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(args.rawBody),
	);
	return constantTimeEqual(actual, new Uint8Array(expected));
}
