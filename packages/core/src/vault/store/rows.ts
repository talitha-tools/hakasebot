import { d1Bindable, d1Value } from "#/d1.ts";
import {
	parseSelect,
	vaultAccountMetaSelect,
	vaultAccountSelect,
} from "#/db/zod.ts";
import { brandString, engineKind, repoRef } from "#/domain.ts";
import type { ParseResult, RepoRef } from "#/domain.ts";
import { errorMessage } from "#/error-message.ts";
import { accountId } from "#/vault/domain.ts";
import type {
	SealedCredential,
	VaultAccountMeta,
	VaultAccountRow,
} from "#/vault/domain.ts";

export function storeError(error: unknown): ParseResult<never> {
	return {
		kind: "invalid",
		message: errorMessage(error, "vault store failed"),
	};
}

export function nullableTimestamp(
	value: number | null | undefined,
): number | undefined {
	const raw = d1Value(value);
	return raw ?? undefined;
}

export function nullableText(
	value: string | null | undefined,
): string | undefined {
	return d1Value(value);
}

export function jsonOrNull(values: readonly string[]): string | null {
	return d1Bindable(values.length === 0 ? undefined : JSON.stringify(values));
}

export function parseSealedCredential(row: {
	ciphertext: string;
	id: string;
	iv: string;
}): ParseResult<SealedCredential> {
	const id = accountId(row.id);
	if (id.kind === "invalid") {
		return id;
	}
	if (row.ciphertext.length === 0 || row.iv.length === 0) {
		return {
			kind: "invalid",
			message: "sealed account row is incomplete",
		};
	}
	return {
		kind: "ok",
		value: {
			accountId: id.value,
			ciphertext: brandString(row.ciphertext, "Ciphertext"),
			iv: brandString(row.iv, "Iv"),
		},
	};
}

export function parseAccountMetaRow(
	row: unknown,
): ParseResult<VaultAccountMeta> {
	const selected = parseSelect(
		vaultAccountMetaSelect,
		row,
		"vault account row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	const {
		createdAt,
		engine: engineRaw,
		id: idRaw,
		label: labelRaw,
	} = selected.value;
	const id = accountId(idRaw);
	if (id.kind === "invalid") {
		return id;
	}
	const engine = engineKind(engineRaw);
	if (engine.kind === "invalid") {
		return engine;
	}
	const label = labelRaw.trim();
	if (label.length === 0) {
		return { kind: "invalid", message: "account label is empty" };
	}
	return {
		kind: "ok",
		value: {
			createdAt,
			engine: engine.value,
			id: id.value,
			label,
		},
	};
}

export function parseAccountRow(row: unknown): ParseResult<VaultAccountRow> {
	const selected = parseSelect(
		vaultAccountSelect,
		row,
		"vault account row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	const meta = parseAccountMetaRow(selected.value);
	if (meta.kind === "invalid") {
		return meta;
	}
	const sealed = parseSealedCredential(selected.value);
	if (sealed.kind === "invalid") {
		return sealed;
	}
	if (selected.value.githubUserId.trim().length === 0) {
		return { kind: "invalid", message: "account github user id is empty" };
	}
	return {
		kind: "ok",
		value: {
			...meta.value,
			githubUserId: selected.value.githubUserId,
			sealed: sealed.value,
		},
	};
}

export function parseRepoDbRow(args: {
	repoId: string;
	repoName: string;
	repoOwner: string;
}): ParseResult<RepoRef> {
	return repoRef({
		id: args.repoId,
		name: args.repoName,
		owner: args.repoOwner,
	});
}
