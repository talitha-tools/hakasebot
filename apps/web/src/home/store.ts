import { createAppDb } from "@hakasebot/core/db/client.ts";
import type {
	GithubInstallationId,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { isRecord } from "@hakasebot/core/is-record.ts";
import type { D1DatabaseLike } from "@hakasebot/core/vault/store.ts";
import {
	createD1VaultStore,
	isD1Database,
} from "@hakasebot/core/vault/store.ts";
import type { DispatchId } from "@hakasebot/core/wake/domain.ts";

import type { WakeStore } from "#/wake/deps.server.ts";

import {
	clearInstallationIfMatches,
	getHomeRepo,
	markHomeSecretsSynced,
	putHomeRepo,
} from "./home-repo-store.ts";
import type { HomeRepoRow } from "./home-repo-store.ts";
import { listLastWakes } from "./last-wakes.ts";
import type { LastWake } from "./last-wakes.ts";
import { createRouteStore } from "./route-store.ts";
import { findWakeRoute } from "./wake-route.ts";
import {
	findAutoWakeForPr,
	findWakeForRuntimePack,
	finishWakeRun,
	getWakeStatus,
	insertWake,
	supersedeInFlightReviewWakes,
	updateWake,
	updateWakeIfStatus,
} from "./wake-run-store.ts";

export type { HomeRepoRow } from "./home-repo-store.ts";
export type { LastWake } from "./last-wakes.ts";
export type { SupersededWakeRow } from "./wake-run-row.ts";

export type HomeStore = WakeStore & {
	findWakeForRuntimePack: (dispatchId: DispatchId) => Promise<
		| {
				consumer: RepoRef;
				githubUserId: string;
		  }
		| undefined
	>;
	getHomeRepo: (
		githubUserId: string,
	) => Promise<ParseResult<HomeRepoRow | undefined>>;
	listLastWakes: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<Record<string, LastWake>>>;
	markHomeSecretsSynced: (args: {
		epoch: number;
		githubUserId: string;
	}) => Promise<ParseResult<HomeRepoRow>>;
	putHomeRepo: (args: {
		githubUserId: string;
		installationId: GithubInstallationId | undefined;
		now: number;
		repo: RepoRef;
	}) => Promise<ParseResult<HomeRepoRow>>;
};

export async function d1FromWorkerEnv(): Promise<D1DatabaseLike | undefined> {
	try {
		const workers: unknown = await import("cloudflare:workers");
		if (!isRecord(workers)) {
			return undefined;
		}
		const { env } = workers;
		if (!isRecord(env)) {
			return undefined;
		}
		const { DB: db } = env;
		if (!isD1Database(db)) {
			return undefined;
		}
		return db;
	} catch {
		return undefined;
	}
}

export function createHomeStore(d1: D1DatabaseLike): HomeStore {
	const db = createAppDb(d1);
	const routeStore = createRouteStore(db);
	const vaultStore = createD1VaultStore(d1);
	return {
		clearInstallationIfMatches: async (args) =>
			clearInstallationIfMatches(db, args),
		disableRepo: async (args) => vaultStore.disableRepo(args),
		findAutoWakeForPr: async (args) => findAutoWakeForPr(db, args),
		findRoute: async (repoId) => findWakeRoute(db, repoId),
		findWakeForRuntimePack: async (dispatchId) =>
			findWakeForRuntimePack(db, dispatchId),
		finishWakeRun: async (dispatchId, status) =>
			finishWakeRun(db, dispatchId, status),
		getHomeRepo: async (githubUserId) => getHomeRepo(db, githubUserId),
		getWakeStatus: async (dispatchId) => getWakeStatus(db, dispatchId),
		insertWake: async (row) => insertWake(db, row),
		isWakeQueued: async (dispatchId) =>
			(await getWakeStatus(db, dispatchId)) === "queued",
		listLastWakes: async (args) => listLastWakes(db, args),
		markHomeSecretsSynced: async (args) => markHomeSecretsSynced(db, args),
		putHomeRepo: async (args) => putHomeRepo(db, args),
		repoHasModelSlots: async (args) => {
			const slots = await vaultStore.listSlotsForRepo(args);
			if (slots.kind === "invalid") {
				return slots;
			}
			return { kind: "ok", value: slots.value.length > 0 };
		},
		releaseByInstallationId: async (args) =>
			routeStore.releaseByInstallationId(args),
		releaseReposByInstallationId: async (args) =>
			routeStore.releaseReposByInstallationId(args),
		setBotInstallation: async (args) => routeStore.setBotInstallation(args),
		supersedeInFlightReviewWakes: async (args) =>
			supersedeInFlightReviewWakes(db, args),
		updateWake: async (dispatchId, patch) => updateWake(db, dispatchId, patch),
		updateWakeIfStatus: async (dispatchId, expectedStatus, patch) =>
			updateWakeIfStatus(db, dispatchId, expectedStatus, patch),
	};
}
