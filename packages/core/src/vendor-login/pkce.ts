import { base64UrlEncode } from "#/base64.ts";
import { brandString } from "#/domain.ts";

import type { Pkce } from "./domain.ts";

const VERIFIER_BYTES = 32;
const STATE_BYTES = 16;

const encoder = new TextEncoder();

function randomBase64Url(byteLength: number): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * Web Crypto only, so the same call works in the browser, on the Worker, and
 * under vitest. Async because S256 hashing is; the reducer never hashes.
 */
export async function createPkce(): Promise<Pkce> {
	const verifier = randomBase64Url(VERIFIER_BYTES);
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(verifier),
	);
	return {
		challenge: brandString(
			base64UrlEncode(new Uint8Array(digest)),
			"PkceChallenge",
		),
		state: brandString(randomBase64Url(STATE_BYTES), "OauthState"),
		verifier: brandString(verifier, "PkceVerifier"),
	};
}
