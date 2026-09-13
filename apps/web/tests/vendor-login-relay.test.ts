import { VENDOR_POST_TARGETS } from "@hakasebot/core/vendor-login.ts";
import type { TokenRequest } from "@hakasebot/core/vendor-login.ts";
import { describe, expect, test } from "vitest";

import { m as msg } from "#/paraglide/messages.js";
import {
	parseRelayInput,
	RELAY_BODY_LIMIT_BYTES,
	relayVendorToken,
} from "#/vendor-login/vendor-login.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const ALLOWED_URL: string = VENDOR_POST_TARGETS.claudeToken;

function signedIn() {
	return {
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: "gho_test" };
		},
	};
}

function allowedRequest(): TokenRequest {
	const parsed = parseRelayInput({
		body: JSON.stringify({ grant_type: "authorization_code" }),
		kind: "preflighted_json",
		url: ALLOWED_URL,
	});
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

describe("vendor login relay input", () => {
	test("only the derived allowlist may be posted to", () => {
		for (const url of [
			"https://api.github.com/user",
			"https://claude.ai/oauth/authorize",
			"https://platform.claude.com/v1/oauth/token/",
			"https://evil.example/v1/oauth/token",
		]) {
			expect(
				parseRelayInput({ body: "", kind: "preflighted_json", url }),
				url,
			).toEqual({
				kind: "invalid",
				message: "that is not a vendor token endpoint",
			});
		}
	});

	test("every allowlisted post target is accepted", () => {
		for (const url of Object.values(VENDOR_POST_TARGETS)) {
			expect(
				parseRelayInput({ body: "a=b", kind: "repeatable_form", url }),
				url,
			).toEqual({
				kind: "ok",
				value: { body: "a=b", kind: "repeatable_form", url },
			});
		}
	});

	test("an unknown request kind is refused", () => {
		expect(
			parseRelayInput({ body: "", kind: "raw_get", url: ALLOWED_URL }),
		).toEqual({ kind: "invalid", message: msg.vendor_login_relay_bad_kind() });
	});

	test("a body over the cap is refused", () => {
		expect(
			parseRelayInput({
				body: "x".repeat(RELAY_BODY_LIMIT_BYTES + 1),
				kind: "single_use_form",
				url: ALLOWED_URL,
			}),
		).toEqual({
			kind: "invalid",
			message: msg.vendor_login_relay_body_too_large(),
		});
	});

	test("the cap counts bytes, not characters", () => {
		const halfway = "ü".repeat(RELAY_BODY_LIMIT_BYTES / 2 + 1);
		expect(halfway.length).toBeLessThan(RELAY_BODY_LIMIT_BYTES);
		expect(
			parseRelayInput({
				body: halfway,
				kind: "single_use_form",
				url: ALLOWED_URL,
			}),
		).toEqual({
			kind: "invalid",
			message: msg.vendor_login_relay_body_too_large(),
		});
	});
});

describe("vendor login relay", () => {
	test("a signed-out caller never reaches the vendor", async () => {
		const calls: string[] = [];
		const relayed = await relayVendorToken({
			cookieHeader: "",
			devUser: { kind: "off" },
			fetchImpl: (url) => {
				calls.push(url);
				return new Response("{}");
			},
			request: allowedRequest(),
		});
		expect(relayed).toEqual({
			kind: "invalid",
			message: msg.vendor_login_relay_unauthorised(),
		});
		expect(calls).toEqual([]);
	});

	test("a signed-in caller gets the vendor status and json back", async () => {
		const seen: { body: string | undefined; url: string }[] = [];
		const relayed = await relayVendorToken({
			...signedIn(),
			fetchImpl: (url, init) => {
				seen.push({ body: init?.body, url });
				return Response.json(
					{ access_token: "sk-ant-oat01" },
					{
						headers: { "Content-Type": "application/json" },
						status: 201,
					},
				);
			},
			request: allowedRequest(),
		});
		expect(relayed).toEqual({
			kind: "ok",
			value: { json: { access_token: "sk-ant-oat01" }, status: 201 },
		});
		expect(seen).toEqual([
			{
				body: JSON.stringify({ grant_type: "authorization_code" }),
				url: ALLOWED_URL,
			},
		]);
	});

	test("a vendor that cannot be reached is invalid, not a throw", async () => {
		const relayed = await relayVendorToken({
			...signedIn(),
			fetchImpl: () => {
				throw new TypeError("Failed to fetch");
			},
			request: allowedRequest(),
		});
		expect(relayed).toEqual({ kind: "invalid", message: "Failed to fetch" });
	});
});
