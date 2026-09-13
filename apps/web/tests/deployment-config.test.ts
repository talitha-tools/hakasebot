import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { expect, test } from "vitest";

import { parseDeploymentConfig } from "#/env.ts";

test("parseDeploymentConfig fills product defaults when input is empty", () => {
	const parsed = parseDeploymentConfig({});
	expect(parsed).toEqual({
		kind: "ok",
		value: {
			actionRef: "talitha-tools/hakasebot@main",
			hostedBotApp: { kind: "unset" },
			lab: {
				sourceRepoUrl: "https://github.com/talitha-tools/hakasebot",
				url: "http://localhost:47821",
			},
		},
	});
});

test("parseDeploymentConfig treats blank branding as product defaults", () => {
	const parsed = parseDeploymentConfig({
		actionRef: "  ",
		labUrl: "",
		sourceRepoUrl: "   ",
	});
	expect(parsed).toEqual(parseDeploymentConfig({}));
});

test("parseDeploymentConfig accepts a full fork re-point", () => {
	const parsed = parseDeploymentConfig({
		actionRef: "me/fork@v2",
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
		hostedAppSlug: "fork-bot",
		labUrl: "https://lab.example",
		sourceRepoUrl: "https://github.com/me/fork",
	});
	expect(parsed).toEqual({
		kind: "ok",
		value: {
			actionRef: "me/fork@v2",
			hostedBotApp: {
				clientId: "Iv23test",
				kind: "configured",
				privateKey: TEST_APP_PRIVATE_KEY,
				slug: "fork-bot",
			},
			lab: {
				sourceRepoUrl: "https://github.com/me/fork",
				url: "https://lab.example",
			},
		},
	});
});

test("parseDeploymentConfig treats a client id without PEM or slug as unset", () => {
	const parsed = parseDeploymentConfig({ hostedAppClientId: "Iv23test" });
	expect(parsed).toEqual(parseDeploymentConfig({}));
});

test("parseDeploymentConfig rejects a Hosted bot App private key without a slug", () => {
	const parsed = parseDeploymentConfig({
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
	});
	expect(parsed).toEqual({
		kind: "invalid",
		message: "HOSTED_APP_PRIVATE_KEY and HOSTED_APP_SLUG must be set together",
	});
});

test("parseDeploymentConfig rejects Hosted bot App credentials without a slug", () => {
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
	});
	expect(parsed).toEqual({
		kind: "invalid",
		message: "HOSTED_APP_PRIVATE_KEY and HOSTED_APP_SLUG must be set together",
	});
});

test("parseDeploymentConfig rejects Hosted bot App credentials without a client id", () => {
	const parsed = parseDeploymentConfig({
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
		hostedAppSlug: "fork-bot",
	});
	expect(parsed).toEqual({
		kind: "invalid",
		message: "HOSTED_APP_CLIENT_ID is required to mint App JWTs",
	});
});

test("parseDeploymentConfig rejects a non-PEM Hosted bot App private key", () => {
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: "not-a-pem-client-secret",
		hostedAppSlug: "fork-bot",
	});
	expect(parsed).toEqual({
		kind: "invalid",
		message:
			"github app private key must be a PEM (-----BEGIN … PRIVATE KEY-----), not a client secret",
	});
});

test("parseDeploymentConfig treats blank Hosted bot App fields as unset", () => {
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "  ",
		hostedAppPrivateKey: "",
		hostedAppSlug: "   ",
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.hostedBotApp).toEqual({ kind: "unset" });
});

test("parseDeploymentConfig rejects a non-http Lab URL", () => {
	expect(parseDeploymentConfig({ labUrl: "not-a-url" })).toEqual({
		kind: "invalid",
		message: "VITE_LAB_URL must be an http(s) URL",
	});
	expect(parseDeploymentConfig({ labUrl: "ftp://lab.example" })).toEqual({
		kind: "invalid",
		message: "VITE_LAB_URL must be an http(s) URL",
	});
});

test("parseDeploymentConfig rejects a non-http source repo URL", () => {
	expect(
		parseDeploymentConfig({ sourceRepoUrl: "github.com/me/fork" }),
	).toEqual({
		kind: "invalid",
		message: "VITE_SOURCE_REPO_URL must be an http(s) URL",
	});
});
