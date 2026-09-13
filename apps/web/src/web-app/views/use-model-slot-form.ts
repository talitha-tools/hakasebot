import type { CatalogModel } from "@hakasebot/core/domain.ts";
import { modelName } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import type { VaultAccountMeta } from "@hakasebot/core/vault/domain.ts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { m as msg } from "#/paraglide/messages.js";
import { getModelCatalogFn } from "#/web-app/catalog-rpc.ts";
import { saveModelSlotFn } from "#/web-app/slots-rpc.ts";

import { EMPTY_SLOT_DRAFT, showFastFor } from "./model-slot-options.ts";
import type { ModelPickMode, SlotDraft } from "./model-slot-options.ts";

async function saveSlot(args: {
	catalogModels: readonly CatalogModel[];
	draft: SlotDraft;
	githubUserId: string | undefined;
	selectedAccount: VaultAccountMeta | undefined;
	slotsCount: number;
}) {
	const { draft, selectedAccount } = args;
	if (args.githubUserId === undefined) {
		throw new Error(msg.lab_not_loaded());
	}
	if (selectedAccount === undefined) {
		throw new Error(msg.models_pick_login());
	}
	const parsedModel = modelName(draft.model);
	if (parsedModel.kind === "invalid") {
		throw new Error(parsedModel.message);
	}
	if (
		draft.pickMode === "catalog" &&
		!args.catalogModels.some((entry) => entry.id === parsedModel.value)
	) {
		throw new Error(msg.models_not_on_list());
	}
	const entry = args.catalogModels.find((item) => item.id === draft.model);
	return saveModelSlotFn({
		data: {
			accountId: selectedAccount.id,
			defaultSortIndex: args.slotsCount,
			engine: selectedAccount.engine,
			fast: showFastFor({ engine: selectedAccount.engine, entry })
				? draft.fast
				: false,
			label: draft.label,
			model: parsedModel.value,
			similarModel: draft.similarModel,
			...(draft.effort.length === 0 ? {} : { effort: draft.effort }),
		},
	});
}

function useModelCatalog(args: {
	enabled: boolean;
	githubUserId: string | undefined;
	selectedAccount: VaultAccountMeta | undefined;
}) {
	const { githubUserId, selectedAccount } = args;
	return useQuery({
		enabled:
			githubUserId !== undefined &&
			selectedAccount !== undefined &&
			args.enabled,
		queryFn: async () => {
			if (selectedAccount === undefined) {
				throw new Error(msg.models_pick_login());
			}
			return getModelCatalogFn({
				data: { engine: selectedAccount.engine },
			});
		},
		queryKey: ["model-catalog", selectedAccount?.engine],
		retry: false,
	});
}

export function useSlotForm(args: {
	accounts: readonly VaultAccountMeta[];
	githubUserId: string | undefined;
	onSaved: () => Promise<unknown>;
	slotsCount: number;
}) {
	const [draft, setDraft] = useState<SlotDraft>(EMPTY_SLOT_DRAFT);
	const [error, setError] = useState<string | undefined>(undefined);
	const selectedAccount = args.accounts.find(
		(account) => account.id === draft.accountId,
	);
	const catalogQuery = useModelCatalog({
		enabled: draft.pickMode === "catalog",
		githubUserId: args.githubUserId,
		selectedAccount,
	});
	const catalogModels = catalogQuery.data?.models ?? [];

	const saveMutation = useMutation({
		mutationFn: async () =>
			saveSlot({
				catalogModels,
				draft,
				githubUserId: args.githubUserId,
				selectedAccount,
				slotsCount: args.slotsCount,
			}),
		onError: (caught: unknown) => {
			setError(errorMessage(caught, msg.models_save_failed()));
		},
		onSuccess: async () => {
			setDraft((current) => ({
				...EMPTY_SLOT_DRAFT,
				accountId: current.accountId,
			}));
			setError(undefined);
			await args.onSaved();
		},
	});

	return {
		catalogModels,
		catalogQuery,
		draft,
		error,
		saveMutation,
		selectedAccount,
		setDraft,
		setError,
	};
}

export type SlotFormState = ReturnType<typeof useSlotForm>;

export function useSlotFormHandlers(form: SlotFormState) {
	const selectedEngine = form.selectedAccount?.engine;
	const patch = (partial: Partial<SlotDraft>) => {
		form.setDraft((current) => ({ ...current, ...partial }));
	};

	return {
		patch,
		pickAccount: (key: string) => {
			form.setError(undefined);
			patch({
				accountId: key.length === 0 ? undefined : key,
				effort: "",
				fast: false,
				model: "",
				pickMode: "catalog",
			});
		},
		pickCatalogModel: (next: string) => {
			const entry = form.catalogModels.find((item) => item.id === next);
			form.setDraft((current) => {
				const keepEffort =
					entry?.efforts === undefined ||
					current.effort.length === 0 ||
					entry.efforts.some((item) => item === current.effort);
				return {
					...current,
					effort: keepEffort ? current.effort : "",
					fast: showFastFor({ engine: selectedEngine, entry })
						? current.fast
						: false,
					model: next,
				};
			});
		},
		setPickMode: (pickMode: ModelPickMode) => {
			patch({ model: "", pickMode });
		},
		submit: () => {
			if (!form.saveMutation.isPending) {
				form.saveMutation.mutate();
			}
		},
	};
}
