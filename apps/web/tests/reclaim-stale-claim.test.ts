import { createAppDb } from "@hakasebot/core/db/client.ts";
import { githubUserToken } from "@hakasebot/core/domain.ts";
import {
	checkClaimHolderWriteAccess,
	holderRepoAccessFromPermission,
} from "@hakasebot/core/github-api.server.ts";
import type { HolderRepoAccess } from "@hakasebot/core/github-api.server.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, describe, expect, test } from "vitest";

import { createRouteStore } from "#/home/route-store.ts";
import { m as msg } from "#/paraglide/messages.js";
import {
	shouldReclaimHeldClaim,
	takeRepoClaim,
} from "#/web-app/reclaim-stale-claim.server.ts";

const repo = testRepoRef("talitha-tools/demo", "900101");

async function hasWriteAccess(): Promise<HolderRepoAccess> {
	await Promise.resolve();
	return { kind: "has-write" };
}

async function noWriteAccess(): Promise<HolderRepoAccess> {
	await Promise.resolve();
	return { kind: "no-access" };
}

async function unknownWriteAccess(): Promise<HolderRepoAccess> {
	await Promise.resolve();
	return { kind: "unknown" };
}

async function okDisable(): Promise<{ kind: "ok"; value: undefined }> {
	await Promise.resolve();
	return { kind: "ok", value: undefined };
}

async function disableAndRecord(
	holderGithubUserId: string,
	disabled: string[],
): Promise<{ kind: "ok"; value: undefined }> {
	await Promise.resolve();
	disabled.push(holderGithubUserId);
	return { kind: "ok", value: undefined };
}

function createMemoryRouteDb() {
	return createRouteStore(createAppDb(memoryD1()));
}

describe("shouldReclaimHeldClaim", () => {
	test("reclaims only when holder has no access", () => {
		expect(shouldReclaimHeldClaim({ kind: "no-access" })).toBe(true);
		expect(shouldReclaimHeldClaim({ kind: "has-write" })).toBe(false);
		expect(shouldReclaimHeldClaim({ kind: "unknown" })).toBe(false);
	});
});

describe("holderRepoAccessFromPermission", () => {
	test("maps github permission strings", () => {
		expect(holderRepoAccessFromPermission("admin")).toEqual({
			kind: "has-write",
		});
		expect(holderRepoAccessFromPermission("write")).toEqual({
			kind: "has-write",
		});
		expect(holderRepoAccessFromPermission("read")).toEqual({
			kind: "no-access",
		});
		expect(holderRepoAccessFromPermission("triage")).toEqual({
			kind: "no-access",
		});
		expect(holderRepoAccessFromPermission("none")).toEqual({
			kind: "no-access",
		});
		expect(holderRepoAccessFromPermission("weird")).toEqual({
			kind: "unknown",
		});
	});
});

describe("checkClaimHolderWriteAccess", () => {
	let restoreFetch: (() => void) | undefined;

	afterEach(() => {
		restoreFetch?.();
		restoreFetch = undefined;
	});

	test("missing github user is no access", async () => {
		restoreFetch = installGithubFetchMock({
			getUserById: () => ({ json: { message: "Not Found" }, status: 404 }),
		});
		const access = await checkClaimHolderWriteAccess({
			holderGithubUserId: "99",
			repo,
			token: must(githubUserToken("ghu_test")),
		});
		expect(access).toEqual({ kind: "no-access" });
	});

	test("write permission is has-write", async () => {
		restoreFetch = installGithubFetchMock({
			collaboratorPermission: () => ({ json: { permission: "write" } }),
			getUserById: () => ({ json: { login: "alice" } }),
		});
		const access = await checkClaimHolderWriteAccess({
			holderGithubUserId: "1",
			repo,
			token: must(githubUserToken("ghu_test")),
		});
		expect(access).toEqual({ kind: "has-write" });
	});

	test("read permission is no access", async () => {
		restoreFetch = installGithubFetchMock({
			collaboratorPermission: () => ({ json: { permission: "read" } }),
			getUserById: () => ({ json: { login: "alice" } }),
		});
		const access = await checkClaimHolderWriteAccess({
			holderGithubUserId: "1",
			repo,
			token: must(githubUserToken("ghu_test")),
		});
		expect(access).toEqual({ kind: "no-access" });
	});
});

describe("takeRepoClaim", () => {
	test("claims when free", async () => {
		const routes = createMemoryRouteDb();
		const result = await takeRepoClaim({
			checkHolderAccess: hasWriteAccess,
			disableHolder: okDisable,
			githubUserId: "1",
			now: 100,
			repo,
			routes,
		});
		expect(result).toEqual({ kind: "ok", value: "claimed" });
		const held = await routes.routeHolder(repo);
		expect(held).toEqual({
			kind: "ok",
			value: {
				botInstallationId: undefined,
				claimedAt: 100,
				generation: 100,
				githubUserId: "1",
				repo,
			},
		});
	});

	test("blocks when holder still has write", async () => {
		const routes = createMemoryRouteDb();
		await routes.claimRoute({ githubUserId: "1", now: 100, repo });
		const result = await takeRepoClaim({
			checkHolderAccess: hasWriteAccess,
			disableHolder: okDisable,
			githubUserId: "2",
			now: 200,
			repo,
			routes,
		});
		expect(result).toEqual({
			kind: "invalid",
			message: msg.repos_held_by_other(),
		});
		const held = await routes.routeHolder(repo);
		expect(held.kind).toBe("ok");
		if (held.kind === "ok") {
			expect(held.value?.githubUserId).toBe("1");
		}
	});

	test("blocks when holder access is unknown", async () => {
		const routes = createMemoryRouteDb();
		await routes.claimRoute({ githubUserId: "1", now: 100, repo });
		const result = await takeRepoClaim({
			checkHolderAccess: unknownWriteAccess,
			disableHolder: okDisable,
			githubUserId: "2",
			now: 200,
			repo,
			routes,
		});
		expect(result).toEqual({
			kind: "invalid",
			message: msg.repos_held_by_other(),
		});
	});

	test("reclaims when holder lost access and disables their row", async () => {
		const routes = createMemoryRouteDb();
		await routes.claimRoute({ githubUserId: "1", now: 100, repo });
		const disabled: string[] = [];
		const result = await takeRepoClaim({
			checkHolderAccess: noWriteAccess,
			disableHolder: async (holderGithubUserId) =>
				disableAndRecord(holderGithubUserId, disabled),
			githubUserId: "2",
			now: 200,
			repo,
			routes,
		});
		expect(result).toEqual({ kind: "ok", value: "claimed" });
		expect(disabled).toEqual(["1"]);
		const held = await routes.routeHolder(repo);
		expect(held).toEqual({
			kind: "ok",
			value: {
				botInstallationId: undefined,
				claimedAt: 200,
				generation: 200,
				githubUserId: "2",
				repo,
			},
		});
	});
});
