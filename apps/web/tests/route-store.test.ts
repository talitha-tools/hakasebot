import { createAppDb } from "@hakasebot/core/db/client.ts";
import { githubAppInstallationId } from "@hakasebot/core/domain.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { createRouteStore } from "#/home/route-store.ts";
import { findWakeRoute } from "#/home/wake-route.ts";

const repo = testRepoRef("talitha-tools/demo", "900001");
const otherRepo = testRepoRef("talitha-tools/other", "900002");
const unrelatedRepo = testRepoRef("octocat/unrelated", "900003");
const installationId = githubAppInstallationId("7");
const otherInstallationId = githubAppInstallationId("8");
if (
	installationId.kind === "invalid" ||
	otherInstallationId.kind === "invalid"
) {
	throw new Error("installation id is invalid");
}

function routeStore() {
	return createRouteStore(createAppDb(memoryD1()));
}

test("claimRoute is exclusive per consumer repo", async () => {
	const store = routeStore();
	const first = await store.claimRoute({
		githubUserId: "1",
		now: 100,
		repo,
	});
	expect(first).toEqual({
		kind: "ok",
		value: {
			kind: "claimed",
			route: {
				claimedAt: 100,
				generation: 100,
				githubUserId: "1",
				botInstallationId: undefined,
				repo,
			},
		},
	});
	const second = await store.claimRoute({
		githubUserId: "2",
		now: 200,
		repo,
	});
	expect(second).toEqual({ kind: "ok", value: { kind: "held-by-other" } });
});

test("releaseRoute lets another user claim", async () => {
	const store = routeStore();
	await store.claimRoute({ githubUserId: "1", now: 100, repo });
	const released = await store.releaseRoute({ githubUserId: "1", repo });
	expect(released).toEqual({ kind: "ok", value: "released" });
	const notHeld = await store.releaseRoute({ githubUserId: "1", repo });
	expect(notHeld).toEqual({ kind: "ok", value: "not-held" });
	const claimed = await store.claimRoute({
		githubUserId: "2",
		now: 300,
		repo,
	});
	expect(claimed.kind).toBe("ok");
	if (claimed.kind !== "ok" || claimed.value.kind !== "claimed") {
		return;
	}
	expect(claimed.value.route.githubUserId).toBe("2");
	expect(claimed.value.route.generation).toBe(300);
});

test("releaseReposByInstallationId releases only removed matching claims", async () => {
	const store = routeStore();
	await store.claimRoute({ githubUserId: "1", now: 100, repo });
	await store.claimRoute({ githubUserId: "1", now: 101, repo: otherRepo });
	await store.claimRoute({
		githubUserId: "2",
		now: 102,
		repo: unrelatedRepo,
	});
	await store.setBotInstallation({
		installationId: installationId.value,
		repo,
	});
	await store.setBotInstallation({
		installationId: installationId.value,
		repo: otherRepo,
	});
	await store.setBotInstallation({
		installationId: otherInstallationId.value,
		repo: unrelatedRepo,
	});

	const released = await store.releaseReposByInstallationId({
		installationId: installationId.value,
		repos: [repo, unrelatedRepo],
	});

	expect(released).toEqual({
		kind: "ok",
		value: [{ githubUserId: "1", repo }],
	});
	expect(await store.routeHolder(repo)).toEqual({
		kind: "ok",
		value: undefined,
	});
	const other = await store.routeHolder(otherRepo);
	const unrelated = await store.routeHolder(unrelatedRepo);
	expect(other.kind).toBe("ok");
	expect(unrelated.kind).toBe("ok");
});

test("releaseByInstallationId releases every matching claim", async () => {
	const store = routeStore();
	await store.claimRoute({ githubUserId: "1", now: 100, repo });
	await store.claimRoute({ githubUserId: "1", now: 101, repo: otherRepo });
	await store.claimRoute({
		githubUserId: "2",
		now: 102,
		repo: unrelatedRepo,
	});
	await store.setBotInstallation({
		installationId: installationId.value,
		repo,
	});
	await store.setBotInstallation({
		installationId: installationId.value,
		repo: otherRepo,
	});
	await store.setBotInstallation({
		installationId: otherInstallationId.value,
		repo: unrelatedRepo,
	});

	const released = await store.releaseByInstallationId({
		installationId: installationId.value,
	});

	expect(released).toEqual({
		kind: "ok",
		value: [
			{ githubUserId: "1", repo },
			{ githubUserId: "1", repo: otherRepo },
		],
	});
	expect(await store.routeHolder(repo)).toEqual({
		kind: "ok",
		value: undefined,
	});
	expect(await store.routeHolder(otherRepo)).toEqual({
		kind: "ok",
		value: undefined,
	});
	const unrelated = await store.routeHolder(unrelatedRepo);
	expect(unrelated.kind).toBe("ok");
});

test("findWakeRoute is disabled for a claim without an enabled row", async () => {
	const d1 = memoryD1();
	const db = createAppDb(d1);
	const store = createRouteStore(db);
	await store.claimRoute({ githubUserId: "1", now: 100, repo });
	const found = await findWakeRoute(db, repo.id);
	expect(found).toMatchObject({
		kind: "ok",
		value: { enabled: false },
	});
});
