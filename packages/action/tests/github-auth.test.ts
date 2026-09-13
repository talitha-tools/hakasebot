import {
	githubAppId,
	githubAppInstallationId,
	githubToken,
} from "@hakasebot/core/domain.ts";
import type { InstallationGrant } from "@hakasebot/core/github-api.server.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { TOKEN_MIN_REMAINING_MS, botAuth } from "#/github-auth.ts";

test("botAuth remints when the grant is inside the remaining window", async () => {
	const mints: string[] = [];
	let now = 1_000_000;
	const auth = botAuth(
		{
			appId: must(githubAppId("1")),
			installationId: must(githubAppInstallationId("2")),
			kind: "app",
			privateKey: TEST_APP_PRIVATE_KEY,
		},
		{
			mint: async () => {
				await Promise.resolve();
				const token = must(githubToken(`ghs_${String(mints.length)}`));
				mints.push(token);
				const grant: InstallationGrant = {
					expiresAt: now + 60 * 60 * 1000,
					token,
				};
				return { kind: "ok", value: grant };
			},
			now: () => now,
		},
	);
	const first = await auth.fresh();
	expect(first).toEqual({ kind: "ok", value: "ghs_0" });
	now += 10 * 60 * 1000;
	const second = await auth.fresh();
	expect(second).toEqual({ kind: "ok", value: "ghs_0" });
	now += 60 * 60 * 1000 - TOKEN_MIN_REMAINING_MS;
	const third = await auth.fresh();
	expect(third).toEqual({ kind: "ok", value: "ghs_1" });
	expect(mints).toEqual(["ghs_0", "ghs_1"]);
});

test("botAuth shares one in-flight mint", async () => {
	let started = 0;
	const gate = Promise.withResolvers<undefined>();
	const startedGate = Promise.withResolvers<undefined>();
	const auth = botAuth(
		{
			appId: must(githubAppId("1")),
			installationId: must(githubAppInstallationId("2")),
			kind: "app",
			privateKey: TEST_APP_PRIVATE_KEY,
		},
		{
			mint: async () => {
				started += 1;
				startedGate.resolve(undefined);
				await gate.promise;
				return {
					kind: "ok",
					value: {
						expiresAt: Date.now() + 60 * 60 * 1000,
						token: must(githubToken("ghs_shared")),
					},
				};
			},
		},
	);
	const pending = [auth.fresh(), auth.fresh(), auth.fresh()];
	await startedGate.promise;
	expect(started).toBe(1);
	gate.resolve(undefined);
	const results = await Promise.all(pending);
	expect(results).toEqual([
		{ kind: "ok", value: "ghs_shared" },
		{ kind: "ok", value: "ghs_shared" },
		{ kind: "ok", value: "ghs_shared" },
	]);
	expect(started).toBe(1);
});

test("botAuth returns the actions-bot token without minting", async () => {
	const auth = botAuth(
		{ kind: "actions-bot", token: must(githubToken("ghs_bot")) },
		{
			mint: () => {
				throw new Error("must not mint");
			},
		},
	);
	await expect(auth.fresh()).resolves.toEqual({
		kind: "ok",
		value: "ghs_bot",
	});
});
