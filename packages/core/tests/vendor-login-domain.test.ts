import { expect, test } from "vitest";

import { base64UrlEncode } from "#/base64.ts";
import { brandString } from "#/domain.ts";
import {
	OAUTH_ENGINES,
	RELAY_ALLOWLIST,
	VENDOR_ENDPOINTS,
	VENDOR_POST_TARGETS,
	contentTypeFor,
	createPkce,
	oauthEngine,
	parseCallbackPaste,
	parseVendorLoginState,
	preflightedJsonPost,
	repeatableFormPost,
	singleUseFormPost,
	transportsFor,
	vendorTokenUrl,
	viewOf,
} from "#/vendor-login.ts";
import type { VendorLoginState } from "#/vendor-login.ts";

const CLAUDE_TOKEN = VENDOR_POST_TARGETS.claudeToken;

test("oauthEngine gates login to the four engines with a public flow", () => {
	for (const engine of OAUTH_ENGINES) {
		expect(oauthEngine(engine)).toBe(engine);
	}
	expect(oauthEngine("cursor")).toBeUndefined();
});

test("consuming form requests are relay-only, probes may go direct", () => {
	expect(transportsFor(singleUseFormPost(CLAUDE_TOKEN, { code: "x" }))).toEqual(
		["relay"],
	);
	expect(
		transportsFor(preflightedJsonPost(CLAUDE_TOKEN, { code: "x" })),
	).toEqual(["direct", "relay"]);
	expect(
		transportsFor(repeatableFormPost(CLAUDE_TOKEN, { code: "x" })),
	).toEqual(["direct", "relay"]);
});

test("content type follows the request kind, not the vendor", () => {
	expect(contentTypeFor(preflightedJsonPost(CLAUDE_TOKEN, {}))).toBe(
		"application/json",
	);
	expect(contentTypeFor(repeatableFormPost(CLAUDE_TOKEN, {}))).toBe(
		"application/x-www-form-urlencoded",
	);
	expect(contentTypeFor(singleUseFormPost(CLAUDE_TOKEN, {}))).toBe(
		"application/x-www-form-urlencoded",
	);
});

test("request bodies are encoded for their kind", () => {
	expect(
		preflightedJsonPost(CLAUDE_TOKEN, { client_id: "one", code: "two" }).body,
	).toBe('{"client_id":"one","code":"two"}');
	expect(repeatableFormPost(CLAUDE_TOKEN, { scope: "a b" }).body).toBe(
		"scope=a+b",
	);
});

test("the relay allowlist holds POST targets only", () => {
	expect(vendorTokenUrl(VENDOR_ENDPOINTS.claude.token).kind).toBe("ok");
	expect(vendorTokenUrl(VENDOR_ENDPOINTS.grok.deviceCode).kind).toBe("ok");
	expect(vendorTokenUrl(VENDOR_ENDPOINTS.claude.authorize).kind).toBe(
		"invalid",
	);
	expect(vendorTokenUrl(VENDOR_ENDPOINTS.claude.redirect).kind).toBe("invalid");
	expect(vendorTokenUrl(VENDOR_ENDPOINTS.codex.verification).kind).toBe(
		"invalid",
	);
	expect(vendorTokenUrl(VENDOR_ENDPOINTS.grok.discovery).kind).toBe("invalid");
	expect(
		vendorTokenUrl("https://github.com/login/oauth/access_token").kind,
	).toBe("invalid");
	expect(
		vendorTokenUrl(`${VENDOR_ENDPOINTS.claude.token}?redirect=evil`).kind,
	).toBe("invalid");
	expect(vendorTokenUrl("https://platform.claude.com").kind).toBe("invalid");
	expect(RELAY_ALLOWLIST).toHaveLength(7);
});

test("createPkce derives an S256 challenge from the verifier", async () => {
	const pkce = await createPkce();
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(pkce.verifier),
	);
	expect(pkce.challenge).toBe(base64UrlEncode(new Uint8Array(digest)));
	expect(pkce.verifier).not.toBe(pkce.state);
	expect(pkce.state).toMatch(/^[\w-]{20,}$/u);
	const other = await createPkce();
	expect(other.verifier).not.toBe(pkce.verifier);
});

test("callback paste takes a code, a code#state, or a whole address", () => {
	expect(parseCallbackPaste("  bare-code  ")).toEqual({
		kind: "ok",
		value: { code: "bare-code", state: undefined },
	});
	expect(parseCallbackPaste("the-code#the-state")).toEqual({
		kind: "ok",
		value: { code: "the-code", state: "the-state" },
	});
	expect(
		parseCallbackPaste(
			"http://localhost:51121/oauth-callback?code=ya29.code&state=st",
		),
	).toEqual({ kind: "ok", value: { code: "ya29.code", state: "st" } });
	expect(parseCallbackPaste("").kind).toBe("invalid");
	expect(parseCallbackPaste("http://localhost:51121/oauth-callback").kind).toBe(
		"invalid",
	);
	expect(
		parseCallbackPaste(
			"http://localhost:51121/oauth-callback?error=access_denied",
		).kind,
	).toBe("invalid");
	expect(parseCallbackPaste("i pressed the wrong button").kind).toBe("invalid");
});

test("viewOf turns both grants into one prompt", () => {
	expect(viewOf({ kind: "idle" })).toEqual({ kind: "idle" });
	expect(viewOf({ engine: "claude", kind: "done", plaintext: "x" })).toEqual({
		kind: "done",
	});
	expect(viewOf({ engine: "grok", kind: "failed", message: "nope" })).toEqual({
		kind: "failed",
		message: "nope",
	});
	expect(
		viewOf({
			engine: "claude",
			kind: "active",
			phase: {
				authorizeUrl: "https://claude.ai/oauth/authorize?code=true",
				kind: "authorize",
				pkce: {
					challenge: brandString("ch", "PkceChallenge"),
					state: brandString("st", "OauthState"),
					verifier: brandString("vr", "PkceVerifier"),
				},
			},
			seq: 0,
			startedAt: 0,
		}),
	).toEqual({
		kind: "prompt",
		prompt: {
			next: "callback_paste",
			url: "https://claude.ai/oauth/authorize?code=true",
			userCode: undefined,
		},
	});
	expect(
		viewOf({
			engine: "grok",
			kind: "active",
			phase: {
				grant: {
					deviceCode: "dc",
					expiresAt: 600_000,
					intervalMs: 5000,
					userCode: "ABCD-EFGH",
					verificationUrl: "https://x.ai/device",
				},
				kind: "device_wait",
				pollAt: 5000,
				polling: undefined,
			},
			seq: 1,
			startedAt: 0,
		}),
	).toEqual({
		kind: "prompt",
		prompt: {
			next: "poll",
			url: "https://x.ai/device",
			userCode: "ABCD-EFGH",
		},
	});
	expect(
		viewOf({
			engine: "codex",
			kind: "active",
			phase: {
				kind: "exchange",
				requestId: brandString("0:2", "RequestId"),
			},
			seq: 2,
			startedAt: 0,
		}),
	).toEqual({ kind: "busy" });
});

test("stored login state round-trips, and rubbish parses to idle", () => {
	const stored: VendorLoginState = {
		engine: "grok",
		kind: "active",
		phase: {
			grant: {
				deviceCode: "dc",
				expiresAt: 600_000,
				intervalMs: 5000,
				userCode: "ABCD-EFGH",
				verificationUrl: "https://x.ai/device",
			},
			kind: "device_wait",
			pollAt: 5000,
			polling: undefined,
		},
		seq: 1,
		startedAt: 0,
	};
	expect(parseVendorLoginState(JSON.stringify(stored))).toEqual(stored);
	expect(parseVendorLoginState('{"kind":"idle"}')).toEqual({ kind: "idle" });
	expect(parseVendorLoginState("not json at all")).toEqual({ kind: "idle" });
	expect(parseVendorLoginState('{"kind":"active","engine":"cursor"}')).toEqual({
		kind: "idle",
	});
});
