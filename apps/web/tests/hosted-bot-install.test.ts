import {
	SECRET_NAMES,
	githubAppId,
	githubAppInstallationId,
	githubAppSlug,
	githubUserToken,
	mentionTrigger,
} from "@hakasebot/core/domain.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import sodium, { base64_variants, ready, to_base64 } from "libsodium-wrappers";
import { afterEach, expect, test } from "vitest";

import {
	hostedBotInstallLink,
	hostedBotInstallUrl,
} from "#/deployment-config.ts";
import { parseDeploymentConfig } from "#/env.ts";
import { writeActionsSecrets } from "#/github-secrets.server.ts";
import {
	hostedBotSecretWrite,
	hostedBotSecretWriteForRepo,
	writeHostedBotSecrets,
} from "#/hosted-bot-install.server.ts";
import { parseCompleteHostedBotInstallInput } from "#/lab/hosted-bot.ts";
import { m as msg } from "#/paraglide/messages.js";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function configuredApp() {
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
		hostedAppSlug: "Hakase-Bot",
	});
	if (parsed.kind !== "ok" || parsed.value.hostedBotApp.kind !== "configured") {
		throw new Error("expected a configured Hosted bot App");
	}
	return parsed.value.hostedBotApp;
}

function testAppSlug(value: string) {
	return must(githubAppSlug(value));
}

function testInstallationId(value: string) {
	return must(githubAppInstallationId(value));
}

test("hostedBotInstallUrl uses the GitHub App slug", () => {
	expect(hostedBotInstallUrl(testAppSlug("hakase-bot"))).toBe(
		"https://github.com/apps/hakase-bot/installations/new",
	);
});

test("hostedBotInstallLink is unset when the Deployment has no App", () => {
	expect(hostedBotInstallLink({ kind: "unset" })).toEqual({ kind: "unset" });
});

test("hostedBotInstallLink builds the install URL from the slug", () => {
	expect(hostedBotInstallLink(configuredApp())).toEqual({
		kind: "configured",
		url: "https://github.com/apps/hakase-bot/installations/new",
	});
});

test("githubAppSlug lowercases and rejects junk", () => {
	const slug = must(githubAppSlug("Hakase-Bot"));
	expect(slug).toBe("hakase-bot");
	expect(mentionTrigger(slug)).toBe("@hakase-bot");
	expect(githubAppSlug("")).toEqual({
		kind: "invalid",
		message: "github app slug is empty",
	});
	expect(githubAppSlug("no spaces")).toEqual({
		kind: "invalid",
		message: "github app slug must be a GitHub App slug",
	});
	expect(githubAppSlug("", "HOSTED_APP_SLUG")).toEqual({
		kind: "invalid",
		message: "HOSTED_APP_SLUG is empty",
	});
});

test("hostedBotSecretWrite maps Deployment config onto the consumer-repo App secrets", () => {
	const hostedBotApp = configuredApp();
	const write = hostedBotSecretWrite({
		hostedBotApp,
		installationId: must(githubAppInstallationId("99")),
	});
	expect(write).toEqual({
		kind: "app",
		appId: must(githubAppId("Iv23test")),
		privateKey: hostedBotApp.privateKey,
		installationId: "99",
	});
});

test("hostedBotSecretWriteForRepo looks up the repo installation", async () => {
	restoreFetch = installGithubFetchMock({
		repoInstallation: (owner, name) => {
			expect(owner).toBe("talitha-tools");
			expect(name).toBe("demo");
			return { json: { id: 99 } };
		},
	});
	const hostedBotApp = configuredApp();
	const write = await hostedBotSecretWriteForRepo({
		hostedBotApp,
		repo: testRepoRef("talitha-tools/demo", "900001"),
	});
	expect(write).toEqual({
		kind: "ok",
		value: {
			kind: "app",
			appId: "Iv23test",
			privateKey: hostedBotApp.privateKey,
			installationId: "99",
		},
	});
});

test("hostedBotSecretWriteForRepo fails when the Deployment has no App", async () => {
	const write = await hostedBotSecretWriteForRepo({
		hostedBotApp: { kind: "unset" },
		repo: testRepoRef("talitha-tools/demo", "900001"),
	});
	expect(write).toEqual({
		kind: "invalid",
		message: msg.hosted_bot_app_unset(),
	});
});

test("hostedBotSecretWriteForRepo fails when the App is not installed on the repo", async () => {
	restoreFetch = installGithubFetchMock({
		repoInstallation: () => ({
			status: 404,
			json: { message: "Not Found" },
		}),
	});
	const write = await hostedBotSecretWriteForRepo({
		hostedBotApp: configuredApp(),
		repo: testRepoRef("talitha-tools/demo", "900001"),
	});
	expect(write).toEqual({
		kind: "invalid",
		message: "Not Found",
	});
});

test("writeActionsSecrets writes the three Hosted bot App secrets", async () => {
	await ready;
	const keyPair = sodium.crypto_box_keypair();
	const publicKey = to_base64(keyPair.publicKey, base64_variants.ORIGINAL);
	const puts: string[] = [];
	restoreFetch = installGithubFetchMock({
		publicKey: () => ({
			json: {
				key_id: "key-1",
				key: publicKey,
			},
		}),
		putSecret: (name) => {
			puts.push(name);
			return { status: 201, json: {} };
		},
	});
	const result = await writeActionsSecrets({
		userToken: must(githubUserToken("ghu_test")),
		repo: testRepoRef("talitha-tools/demo", "900001"),
		writes: [
			hostedBotSecretWrite({
				hostedBotApp: configuredApp(),
				installationId: testInstallationId("99"),
			}),
		],
	});
	expect(result).toEqual({
		kind: "ok",
		names: [
			SECRET_NAMES.githubAppId,
			SECRET_NAMES.githubAppPrivateKey,
			SECRET_NAMES.githubAppInstallationId,
		],
	});
	expect(puts).toEqual([
		SECRET_NAMES.githubAppId,
		SECRET_NAMES.githubAppPrivateKey,
		SECRET_NAMES.githubAppInstallationId,
	]);
});

test("writeHostedBotSecrets returns the installation failure", async () => {
	const puts: string[] = [];
	restoreFetch = installGithubFetchMock({
		repoInstallation: () => ({
			status: 404,
			json: { message: "Not Found" },
		}),
		putSecret: (name) => {
			puts.push(name);
			return { status: 201, json: {} };
		},
	});
	const result = await writeHostedBotSecrets({
		hostedBotApp: configuredApp(),
		repo: testRepoRef("talitha-tools/demo", "900001"),
		token: must(githubUserToken("ghu_test")),
	});
	expect(result).toEqual({
		kind: "invalid",
		message: "Not Found",
	});
	expect(puts).toEqual([]);
});

test("parseCompleteHostedBotInstallInput rejects an invalid owner", () => {
	expect(() =>
		parseCompleteHostedBotInstallInput({
			repo: { id: "1", name: "demo", owner: "no spaces" },
		}),
	).toThrow("invalid repository owner");
});

test("parseCompleteHostedBotInstallInput accepts a parsed repo", () => {
	const repo = testRepoRef("talitha-tools/demo", "900001");
	expect(
		parseCompleteHostedBotInstallInput({
			repo: { id: repo.id, name: repo.name, owner: repo.owner },
		}),
	).toEqual({ repo });
});
