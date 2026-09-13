import { expect, test } from "vitest";

import { base64UrlEncode } from "#/base64.ts";
import { brandString } from "#/domain.ts";
import { parseCredentialPaste } from "#/vault/parse-credential.ts";
import {
	LOGIN_TTL_MS,
	VENDOR_ENDPOINTS,
	VENDOR_POST_TARGETS,
	reduceVendorLogin,
	transportsFor,
	viewOf,
} from "#/vendor-login.ts";
import type {
	Pkce,
	RequestId,
	TokenRequest,
	VendorLoginReduce,
	VendorLoginState,
} from "#/vendor-login.ts";

const YEAR_S = 365 * 24 * 60 * 60;

function testPkce(): Pkce {
	return {
		challenge: brandString("test-challenge", "PkceChallenge"),
		state: brandString("test-state", "OauthState"),
		verifier: brandString("test-verifier", "PkceVerifier"),
	};
}

function sent(reduced: VendorLoginReduce): {
	request: TokenRequest;
	requestId: RequestId;
} {
	for (const effect of reduced.effects) {
		if (effect.kind === "http") {
			return { request: effect.request, requestId: effect.requestId };
		}
	}
	throw new Error("expected an http effect");
}

function wakeAt(reduced: VendorLoginReduce): number {
	for (const effect of reduced.effects) {
		if (effect.kind === "wake_at") {
			return effect.at;
		}
	}
	throw new Error("expected a wake_at effect");
}

function activePhase(state: VendorLoginState) {
	if (state.kind !== "active") {
		throw new Error(`expected an active login, got ${state.kind}`);
	}
	return state.phase;
}

function formFields(request: TokenRequest): Record<string, string> {
	return Object.fromEntries(new URLSearchParams(request.body));
}

function fakeJwt(claims: Record<string, unknown>): string {
	return `header.${base64UrlEncode(JSON.stringify(claims))}.signature`;
}

test("claude runs idle → authorize → callback → exchange → done", () => {
	const pkce = testPkce();
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "claude", kind: "start", now: 0, pkce },
	);
	expect(started.effects).toEqual([]);
	const authorize = activePhase(started.state);
	if (authorize.kind !== "authorize") {
		throw new Error("expected the authorize phase");
	}
	const url = new URL(authorize.authorizeUrl);
	expect(`${url.origin}${url.pathname}`).toBe(
		VENDOR_ENDPOINTS.claude.authorize,
	);
	expect(url.searchParams.get("code")).toBe("true");
	expect(url.searchParams.get("redirect_uri")).toBe(
		VENDOR_ENDPOINTS.claude.redirect,
	);
	expect(url.searchParams.get("code_challenge")).toBe(pkce.challenge);
	expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	expect(url.searchParams.get("state")).toBe(pkce.state);

	const pasted = reduceVendorLogin(started.state, {
		kind: "callback_pasted",
		now: 1000,
		text: `auth-code#${pkce.state}`,
	});
	expect(activePhase(pasted.state).kind).toBe("exchange");
	expect(viewOf(pasted.state)).toEqual({ kind: "busy" });
	const exchange = sent(pasted);
	expect(exchange.request.url).toBe(VENDOR_POST_TARGETS.claudeToken);
	expect(JSON.parse(exchange.request.body)).toEqual({
		client_id: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
		code: "auth-code",
		code_verifier: pkce.verifier,
		grant_type: "authorization_code",
		redirect_uri: VENDOR_ENDPOINTS.claude.redirect,
		state: pkce.state,
	});

	const done = reduceVendorLogin(pasted.state, {
		kind: "http_ok",
		now: 2000,
		requestId: exchange.requestId,
		response: {
			json: { access_token: "sk-ant-oat01-minted", expires_in: YEAR_S },
			status: 200,
		},
	});
	expect(done.state).toEqual({
		engine: "claude",
		kind: "done",
		plaintext: "sk-ant-oat01-minted",
	});
	expect(done.effects).toEqual([
		{ engine: "claude", kind: "credential", plaintext: "sk-ant-oat01-minted" },
	]);
	expect(viewOf(done.state)).toEqual({ kind: "done" });
});

test("a pasted code from another login is refused", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "claude", kind: "start", now: 0, pkce: testPkce() },
	);
	const failed = reduceVendorLogin(started.state, {
		kind: "callback_pasted",
		now: 1000,
		text: "auth-code#someone-elses-state",
	});
	expect(failed.state).toEqual({
		engine: "claude",
		kind: "failed",
		message: "that code isn't from this login. start again",
	});
	expect(failed.effects).toEqual([]);
});

test("a short-lived claude token fails instead of filling the draft", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "claude", kind: "start", now: 0, pkce: testPkce() },
	);
	const pasted = reduceVendorLogin(started.state, {
		kind: "callback_pasted",
		now: 1000,
		text: "auth-code",
	});
	const failed = reduceVendorLogin(pasted.state, {
		kind: "http_ok",
		now: 2000,
		requestId: sent(pasted).requestId,
		response: {
			json: { access_token: "sk-ant-oat01-short", expires_in: 3600 },
			status: 200,
		},
	});
	expect(viewOf(failed.state)).toEqual({
		kind: "failed",
		message: "claude gave a short-lived token. try Login again later",
	});
});

test("anthropic refusing the exchange tells the user to try Login again", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "claude", kind: "start", now: 0, pkce: testPkce() },
	);
	const pasted = reduceVendorLogin(started.state, {
		kind: "callback_pasted",
		now: 1000,
		text: "auth-code",
	});
	const failed = reduceVendorLogin(pasted.state, {
		kind: "http_ok",
		now: 2000,
		requestId: sent(pasted).requestId,
		response: { json: undefined, status: 403 },
	});
	if (failed.state.kind !== "failed") {
		throw new Error("expected a failed login");
	}
	expect(failed.state.message).toContain("try Login again");
});

test("codex device login polls, then exchanges the granted code", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "codex", kind: "start", now: 0, pkce: testPkce() },
	);
	const deviceRequest = sent(started);
	expect(deviceRequest.request.url).toBe(VENDOR_POST_TARGETS.codexDeviceCode);
	expect(JSON.parse(deviceRequest.request.body)).toEqual({
		client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
	});
	expect(viewOf(started.state)).toEqual({ kind: "busy" });

	const granted = reduceVendorLogin(started.state, {
		kind: "http_ok",
		now: 1000,
		requestId: deviceRequest.requestId,
		response: {
			json: {
				device_auth_id: "dev-auth-1",
				interval: 5,
				user_code: "WXYZ-1234",
			},
			status: 200,
		},
	});
	expect(viewOf(granted.state)).toEqual({
		kind: "prompt",
		prompt: {
			next: "poll",
			url: VENDOR_ENDPOINTS.codex.verification,
			userCode: "WXYZ-1234",
		},
	});
	expect(wakeAt(granted)).toBe(6000);

	const polling = reduceVendorLogin(granted.state, {
		kind: "tick",
		now: 6000,
	});
	const firstPoll = sent(polling);
	expect(JSON.parse(firstPoll.request.body)).toEqual({
		device_auth_id: "dev-auth-1",
		user_code: "WXYZ-1234",
	});

	const stillWaiting = reduceVendorLogin(polling.state, {
		kind: "http_ok",
		now: 6500,
		requestId: firstPoll.requestId,
		response: { json: undefined, status: 403 },
	});
	expect(wakeAt(stillWaiting)).toBe(11_500);

	const secondPoll = reduceVendorLogin(stillWaiting.state, {
		kind: "tick",
		now: 11_500,
	});
	const polled = reduceVendorLogin(secondPoll.state, {
		kind: "http_ok",
		now: 12_000,
		requestId: sent(secondPoll).requestId,
		response: {
			json: {
				authorization_code: "device-granted-code",
				code_verifier: "device-verifier",
			},
			status: 200,
		},
	});
	const exchange = sent(polled);
	expect(activePhase(polled.state).kind).toBe("exchange");
	// A form body that spends a single-use code never goes direct.
	expect(transportsFor(exchange.request)).toEqual(["relay"]);
	expect(formFields(exchange.request)).toEqual({
		client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
		code: "device-granted-code",
		code_verifier: "device-verifier",
		grant_type: "authorization_code",
		redirect_uri: VENDOR_ENDPOINTS.codex.redirect,
	});

	const done = reduceVendorLogin(polled.state, {
		kind: "http_ok",
		now: 13_000,
		requestId: exchange.requestId,
		response: {
			json: {
				access_token: "codex-access",
				id_token: fakeJwt({
					"https://api.openai.com/auth": { chatgpt_account_id: "acct_9" },
				}),
				refresh_token: "codex-refresh",
			},
			status: 200,
		},
	});
	if (done.state.kind !== "done") {
		throw new Error("expected a finished login");
	}
	expect(
		parseCredentialPaste({ engine: "codex", raw: done.state.plaintext }).kind,
	).toBe("ok");
	expect(JSON.parse(done.state.plaintext)).toMatchObject({
		tokens: { account_id: "acct_9" },
	});
});

test("grok backs off further on every slow_down", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "grok", kind: "start", now: 0, pkce: testPkce() },
	);
	const deviceRequest = sent(started);
	expect(formFields(deviceRequest.request)).toEqual({
		client_id: "b1a00492-073a-47ea-816f-4c329264a828",
		scope: "openid profile email offline_access grok-cli:access api:access",
	});

	const granted = reduceVendorLogin(started.state, {
		kind: "http_ok",
		now: 0,
		requestId: deviceRequest.requestId,
		response: {
			json: {
				device_code: "device-code-1",
				expires_in: 600,
				interval: 5,
				user_code: "ABCD-EFGH",
				verification_uri: "https://x.ai/device",
				verification_uri_complete: "https://x.ai/device?user_code=ABCD-EFGH",
			},
			status: 200,
		},
	});
	expect(viewOf(granted.state)).toEqual({
		kind: "prompt",
		prompt: {
			next: "poll",
			url: "https://x.ai/device?user_code=ABCD-EFGH",
			userCode: "ABCD-EFGH",
		},
	});

	const firstPoll = reduceVendorLogin(granted.state, {
		kind: "tick",
		now: 5000,
	});
	expect(formFields(sent(firstPoll).request)).toEqual({
		client_id: "b1a00492-073a-47ea-816f-4c329264a828",
		device_code: "device-code-1",
		grant_type: "urn:ietf:params:oauth:grant-type:device_code",
	});

	const slowed = reduceVendorLogin(firstPoll.state, {
		kind: "http_ok",
		now: 5100,
		requestId: sent(firstPoll).requestId,
		response: { json: { error: "slow_down" }, status: 400 },
	});
	expect(wakeAt(slowed)).toBe(15_100);

	const secondPoll = reduceVendorLogin(slowed.state, {
		kind: "tick",
		now: 15_100,
	});
	const slowedAgain = reduceVendorLogin(secondPoll.state, {
		kind: "http_ok",
		now: 15_200,
		requestId: sent(secondPoll).requestId,
		response: { json: { error: "slow_down" }, status: 400 },
	});
	expect(wakeAt(slowedAgain)).toBe(15_200 + 15_000);

	const thirdPoll = reduceVendorLogin(slowedAgain.state, {
		kind: "tick",
		now: 30_200,
	});
	const pending = reduceVendorLogin(thirdPoll.state, {
		kind: "http_ok",
		now: 30_300,
		requestId: sent(thirdPoll).requestId,
		response: { json: { error: "authorization_pending" }, status: 400 },
	});
	expect(wakeAt(pending)).toBe(30_300 + 15_000);

	const fourthPoll = reduceVendorLogin(pending.state, {
		kind: "tick",
		now: 45_300,
	});
	const denied = reduceVendorLogin(fourthPoll.state, {
		kind: "http_ok",
		now: 45_400,
		requestId: sent(fourthPoll).requestId,
		response: { json: { error: "access_denied" }, status: 400 },
	});
	expect(denied.state).toEqual({
		engine: "grok",
		kind: "failed",
		message: "xai says that login was knocked back",
	});
});

test("grok hands back a credential the grok CLI could read", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "grok", kind: "start", now: 0, pkce: testPkce() },
	);
	const granted = reduceVendorLogin(started.state, {
		kind: "http_ok",
		now: 0,
		requestId: sent(started).requestId,
		response: {
			json: {
				device_code: "device-code-1",
				expires_in: 600,
				interval: 5,
				user_code: "ABCD-EFGH",
				verification_uri: "https://x.ai/device",
			},
			status: 200,
		},
	});
	const poll = reduceVendorLogin(granted.state, { kind: "tick", now: 5000 });
	const done = reduceVendorLogin(poll.state, {
		kind: "http_ok",
		now: 5100,
		requestId: sent(poll).requestId,
		response: {
			json: {
				access_token: "xai-access",
				expires_in: 3600,
				refresh_token: "xai-refresh",
				token_type: "Bearer",
			},
			status: 200,
		},
	});
	if (done.state.kind !== "done") {
		throw new Error("expected a finished login");
	}
	expect(
		parseCredentialPaste({ engine: "grok", raw: done.state.plaintext }).kind,
	).toBe("ok");
	expect(JSON.parse(done.state.plaintext)).toMatchObject({
		"https://auth.x.ai::b1a00492-073a-47ea-816f-4c329264a828": {
			key: "xai-access",
			refresh_token: "xai-refresh",
		},
	});
});

test("antigravity takes the dead loopback address and mints the agy file", () => {
	const pkce = testPkce();
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "antigravity", kind: "start", now: 0, pkce },
	);
	const authorize = activePhase(started.state);
	if (authorize.kind !== "authorize") {
		throw new Error("expected the authorize phase");
	}
	const url = new URL(authorize.authorizeUrl);
	expect(url.searchParams.get("access_type")).toBe("offline");
	expect(url.searchParams.get("prompt")).toBe("consent");
	expect(url.searchParams.get("redirect_uri")).toBe(
		VENDOR_ENDPOINTS.antigravity.redirect,
	);

	const pasted = reduceVendorLogin(started.state, {
		kind: "callback_pasted",
		now: 1000,
		text: `${VENDOR_ENDPOINTS.antigravity.redirect}?code=4/0Ax-code&state=${pkce.state}&scope=openid`,
	});
	const exchange = sent(pasted);
	expect(transportsFor(exchange.request)).toEqual(["relay"]);
	expect(formFields(exchange.request)).toMatchObject({
		code: "4/0Ax-code",
		code_verifier: pkce.verifier,
		grant_type: "authorization_code",
		redirect_uri: VENDOR_ENDPOINTS.antigravity.redirect,
	});

	const done = reduceVendorLogin(pasted.state, {
		kind: "http_ok",
		now: 2000,
		requestId: exchange.requestId,
		response: {
			json: {
				access_token: "ya29.access",
				expires_in: 3599,
				refresh_token: "1//04-refresh",
				token_type: "Bearer",
			},
			status: 200,
		},
	});
	if (done.state.kind !== "done") {
		throw new Error("expected a finished login");
	}
	expect(
		parseCredentialPaste({ engine: "antigravity", raw: done.state.plaintext })
			.kind,
	).toBe("ok");
});

test("a login that outlives its TTL fails on the next event", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "claude", kind: "start", now: 0, pkce: testPkce() },
	);
	const expired = reduceVendorLogin(started.state, {
		kind: "tick",
		now: LOGIN_TTL_MS + 1,
	});
	expect(expired.state).toEqual({
		engine: "claude",
		kind: "failed",
		message: "that login timed out. start again",
	});
});

test("an expired device code stops the polling", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "grok", kind: "start", now: 0, pkce: testPkce() },
	);
	const granted = reduceVendorLogin(started.state, {
		kind: "http_ok",
		now: 0,
		requestId: sent(started).requestId,
		response: {
			json: {
				device_code: "device-code-1",
				expires_in: 600,
				interval: 5,
				user_code: "ABCD-EFGH",
				verification_uri: "https://x.ai/device",
			},
			status: 200,
		},
	});
	const expired = reduceVendorLogin(granted.state, {
		kind: "tick",
		now: 600_000,
	});
	expect(expired.state).toEqual({
		engine: "grok",
		kind: "failed",
		message: "that device code expired. start again",
	});
});

test("stale replies, double pastes, cancel, and reset are all harmless", () => {
	const pkce = testPkce();
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "claude", kind: "start", now: 0, pkce },
	);
	const pasted = reduceVendorLogin(started.state, {
		kind: "callback_pasted",
		now: 1000,
		text: `auth-code#${pkce.state}`,
	});

	const doublePaste = reduceVendorLogin(pasted.state, {
		kind: "callback_pasted",
		now: 1100,
		text: `auth-code#${pkce.state}`,
	});
	expect(doublePaste.state).toBe(pasted.state);
	expect(doublePaste.effects).toEqual([]);

	const stale = reduceVendorLogin(pasted.state, {
		kind: "http_ok",
		now: 1200,
		requestId: brandString("0:99", "RequestId"),
		response: { json: { access_token: "from-a-dead-login" }, status: 200 },
	});
	expect(stale.state).toBe(pasted.state);

	const blip = reduceVendorLogin(pasted.state, {
		kind: "http_failed",
		message: "the relay could not be reached",
		now: 1300,
		requestId: sent(pasted).requestId,
	});
	expect(blip.state).toEqual({
		engine: "claude",
		kind: "failed",
		message: "the relay could not be reached",
	});

	expect(reduceVendorLogin(pasted.state, { kind: "cancel" }).state).toEqual({
		kind: "idle",
	});
	expect(reduceVendorLogin(blip.state, { kind: "reset" }).state).toEqual({
		kind: "idle",
	});
	expect(reduceVendorLogin({ kind: "idle" }, { kind: "reset" }).state).toEqual({
		kind: "idle",
	});
});

test("a relay blip mid-poll retries instead of failing the login", () => {
	const started = reduceVendorLogin(
		{ kind: "idle" },
		{ engine: "grok", kind: "start", now: 0, pkce: testPkce() },
	);
	const granted = reduceVendorLogin(started.state, {
		kind: "http_ok",
		now: 0,
		requestId: sent(started).requestId,
		response: {
			json: {
				device_code: "device-code-1",
				expires_in: 600,
				interval: 5,
				user_code: "ABCD-EFGH",
				verification_uri: "https://x.ai/device",
			},
			status: 200,
		},
	});
	const poll = reduceVendorLogin(granted.state, { kind: "tick", now: 5000 });
	const blipped = reduceVendorLogin(poll.state, {
		kind: "http_failed",
		message: "the relay could not be reached",
		now: 5100,
		requestId: sent(poll).requestId,
	});
	expect(activePhase(blipped.state).kind).toBe("device_wait");
	expect(wakeAt(blipped)).toBe(10_100);
});
