import { base64ToBytes } from "#/base64.ts";
import type { ParseResult } from "#/domain.ts";
import { parseInvalid, parseOk } from "#/domain.ts";

const decoder = new TextDecoder();

function base64UrlToBase64(value: string): string {
	const standard = value.replaceAll("-", "+").replaceAll("_", "/");
	return standard.padEnd(
		standard.length + ((4 - (standard.length % 4)) % 4),
		"=",
	);
}

/**
 * Unverified payload decode of the middle JWT segment. The claims travel into a
 * credential file for the vendor CLI; nothing here is a trust decision.
 */
export function decodeJwtPayload(jwt: string): ParseResult<unknown> {
	const [, payload] = jwt.split(".");
	if (payload === undefined || payload.length === 0) {
		return parseInvalid("that id token is not a JWT");
	}
	let bytes: Uint8Array;
	try {
		bytes = base64ToBytes(base64UrlToBase64(payload));
	} catch {
		return parseInvalid("that id token payload is not base64url");
	}
	try {
		return parseOk(JSON.parse(decoder.decode(bytes)));
	} catch {
		return parseInvalid("that id token payload is not JSON");
	}
}
