import { z } from "zod";

import type {
	EngineKind,
	ModelCatalog,
	ParseResult,
	RepoRef,
} from "#/domain.ts";
import { engineKind, parseInvalid, parseOk } from "#/domain.ts";
import { isRecord } from "#/is-record.ts";
import { parseModelCatalogValue } from "#/model-catalog.ts";
import type {
	AccountId,
	CredentialVault,
	SealedCredential,
} from "#/vault/domain.ts";
import { credentialVaultForSlots } from "#/vault/resolve-order.ts";
import type { VaultStore } from "#/vault/store.ts";
import { parseUnknown } from "#/zod-parse.ts";

import type { HomePrefsFile, HomeRepoAllowlist } from "./prefs.ts";
import {
	parseHomePrefsValue,
	parseHomeVaultValue,
	slotsForConsumer,
} from "./prefs.ts";

export const NO_MODEL_SLOTS_MESSAGE = "no model slots for this repo";

function buildCredentialVault(
	accounts: readonly SealedCredential[],
): CredentialVault {
	return {
		accounts: [...accounts],
		version: 1,
	};
}

export interface HomeRuntimePack {
	catalogs: Partial<Record<EngineKind, ModelCatalog>>;
	prefs: HomePrefsFile;
	vault: CredentialVault;
	version: 1;
}

async function loadConsumerAllowlist(args: {
	consumer: RepoRef;
	githubUserId: string;
	store: VaultStore;
}): Promise<ParseResult<HomeRepoAllowlist>> {
	const enabled = await args.store.listEnabledRepos({
		githubUserId: args.githubUserId,
	});
	if (enabled.kind === "invalid") {
		return enabled;
	}
	const row = enabled.value.find((entry) => entry.repo.id === args.consumer.id);
	if (row === undefined) {
		return {
			kind: "invalid",
			message: "consumer repo is not enabled for this wake",
		};
	}
	const repoSlots = await args.store.listSlotsForRepo({
		githubUserId: args.githubUserId,
		repo: row.repo,
	});
	if (repoSlots.kind === "invalid") {
		return repoSlots;
	}
	return {
		kind: "ok",
		value: {
			repo: row.repo,
			slotIds: repoSlots.value.map((slot) => slot.id),
			...(row.prompt === undefined ? {} : { prompt: row.prompt }),
			...(row.ignorePaths === undefined
				? {}
				: { ignorePaths: row.ignorePaths }),
		},
	};
}

async function loadSealedRows(args: {
	githubUserId: string;
	store: VaultStore;
}): Promise<ParseResult<{ id: AccountId; sealed: SealedCredential }[]>> {
	const accounts = await args.store.listAccounts({
		githubUserId: args.githubUserId,
	});
	if (accounts.kind === "invalid") {
		return accounts;
	}
	const loaded = await Promise.all(
		accounts.value.map(async (meta) => ({
			account: await args.store.getAccount({
				githubUserId: args.githubUserId,
				id: meta.id,
			}),
			id: meta.id,
		})),
	);
	const sealedRows: { id: AccountId; sealed: SealedCredential }[] = [];
	for (const { account, id } of loaded) {
		if (account.kind === "invalid") {
			return account;
		}
		sealedRows.push({ id, sealed: account.value.sealed });
	}
	return { kind: "ok", value: sealedRows };
}

async function loadPackCatalogs(args: {
	catalogFor?: (engine: EngineKind) => Promise<ModelCatalog | undefined>;
	engines: readonly EngineKind[];
}): Promise<Partial<Record<EngineKind, ModelCatalog>>> {
	const catalogs: Partial<Record<EngineKind, ModelCatalog>> = {};
	const { catalogFor } = args;
	if (catalogFor === undefined) {
		return catalogs;
	}
	const unique = [...new Set(args.engines)];
	await Promise.all(
		unique.map(async (engine) => {
			const catalog = await catalogFor(engine);
			if (catalog !== undefined) {
				catalogs[engine] = catalog;
			}
		}),
	);
	return catalogs;
}

function packFromParts(args: {
	allowlist: HomeRepoAllowlist;
	catalogs: Partial<Record<EngineKind, ModelCatalog>>;
	slots: HomePrefsFile["slots"];
	vault: CredentialVault;
}): HomeRuntimePack {
	return {
		catalogs: args.catalogs,
		prefs: {
			repos: [args.allowlist],
			slots: args.slots,
			version: 1,
		},
		vault: args.vault,
		version: 1,
	};
}

function orderedSlotsOrInvalid(args: {
	allowlist: HomeRepoAllowlist;
	consumer: RepoRef;
	slots: HomePrefsFile["slots"];
}): ParseResult<HomePrefsFile["slots"]> {
	const orderedSlots = slotsForConsumer({
		consumer: args.consumer,
		prefs: {
			repos: [args.allowlist],
			slots: args.slots,
			version: 1,
		},
	});
	if (orderedSlots.length === 0) {
		return {
			kind: "invalid",
			message: NO_MODEL_SLOTS_MESSAGE,
		};
	}
	return { kind: "ok", value: orderedSlots };
}

export async function buildHomeRuntimePack(args: {
	catalogFor?: (engine: EngineKind) => Promise<ModelCatalog | undefined>;
	consumer: RepoRef;
	githubUserId: string;
	store: VaultStore;
}): Promise<ParseResult<HomeRuntimePack>> {
	const slots = await args.store.listModelSlots({
		githubUserId: args.githubUserId,
	});
	if (slots.kind === "invalid") {
		return slots;
	}
	const allowlist = await loadConsumerAllowlist(args);
	if (allowlist.kind === "invalid") {
		return allowlist;
	}
	const orderedSlots = orderedSlotsOrInvalid({
		allowlist: allowlist.value,
		consumer: args.consumer,
		slots: slots.value,
	});
	if (orderedSlots.kind === "invalid") {
		return orderedSlots;
	}
	const sealedRows = await loadSealedRows(args);
	if (sealedRows.kind === "invalid") {
		return sealedRows;
	}
	const vault = buildCredentialVault(
		credentialVaultForSlots({
			accounts: sealedRows.value,
			slotAccountIds: orderedSlots.value.map((slot) => slot.accountId),
		}),
	);
	const catalogs = await loadPackCatalogs({
		engines: orderedSlots.value.map((slot) => slot.engine),
		...(args.catalogFor === undefined ? {} : { catalogFor: args.catalogFor }),
	});
	return {
		kind: "ok",
		value: packFromParts({
			allowlist: allowlist.value,
			catalogs,
			slots: orderedSlots.value,
			vault,
		}),
	};
}

function parsePackCatalogs(
	raw: unknown,
): ParseResult<Partial<Record<EngineKind, ModelCatalog>>> {
	if (raw === undefined) {
		return parseOk({});
	}
	if (!isRecord(raw)) {
		return parseInvalid("runtime pack catalogs is not an object");
	}
	const catalogs: Partial<Record<EngineKind, ModelCatalog>> = {};
	for (const [key, value] of Object.entries(raw)) {
		const parsedEngine = engineKind(key);
		if (parsedEngine.kind === "invalid") {
			continue;
		}
		const catalog = parseModelCatalogValue(value);
		if (catalog.kind === "invalid") {
			return catalog;
		}
		if (catalog.value.engine !== parsedEngine.value) {
			return parseInvalid("runtime pack catalog engine does not match");
		}
		catalogs[parsedEngine.value] = catalog.value;
	}
	return parseOk(catalogs);
}

const homeRuntimePackSchema = z.object(
	{
		catalogs: z.unknown().optional(),
		prefs: z.unknown(),
		vault: z.unknown(),
		version: z.literal(1, {
			error: "runtime pack version is unsupported",
		}),
	},
	{ error: "runtime pack version is unsupported" },
);

export function parseHomeRuntimePack(
	raw: unknown,
): ParseResult<HomeRuntimePack> {
	const envelope = parseUnknown(homeRuntimePackSchema, raw);
	if (envelope.kind === "invalid") {
		return envelope;
	}
	const prefs = parseHomePrefsValue(envelope.value.prefs);
	if (prefs.kind === "invalid") {
		return prefs;
	}
	const vault = parseHomeVaultValue(envelope.value.vault);
	if (vault.kind === "invalid") {
		return vault;
	}
	const catalogs = parsePackCatalogs(envelope.value.catalogs);
	if (catalogs.kind === "invalid") {
		return catalogs;
	}
	return {
		kind: "ok",
		value: {
			catalogs: catalogs.value,
			prefs: prefs.value,
			vault: vault.value,
			version: 1,
		},
	};
}
