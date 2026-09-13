import { errorMessage } from "@hakasebot/core/error-message.ts";
import { AUTO_BRANCH_SCOPES } from "@hakasebot/core/wake/domain.ts";
import type {
	AutoBranches,
	AutoBranchScope,
} from "@hakasebot/core/wake/domain.ts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { m as msg } from "#/paraglide/messages.js";
import type { EnabledRepo } from "#/web-app/domain.ts";
import { setRepoAutoBranchesFn } from "#/web-app/repos-rpc.ts";

import { autoBranchHint, autoBranchLabel } from "./auto-setting-copy.ts";
import { SaveListField } from "./save-list-field.tsx";
import { ScopeToggleGroup } from "./scope-toggle.tsx";
import { SettingGroup } from "./setting-group.tsx";

function parseBranchField(value: string): string[] {
	return value
		.split(/[,\n]/u)
		.map((branch) => branch.trim())
		.filter((branch) => branch.length > 0);
}

function activeScope(
	autoBranches: AutoBranches,
	listedDraft: boolean,
): AutoBranchScope {
	if (listedDraft && autoBranches.scope !== "listed") {
		return "listed";
	}
	return autoBranches.scope;
}

export function AutoBranchesToggle(props: {
	autoBranches: AutoBranches;
	listedDraft: boolean;
	onInvalidate: () => Promise<void>;
	onPickListed: () => void;
	onScopeSaved: () => void;
	repo: string;
}): ReactNode {
	const mutation = useMutation({
		mutationFn: async (scope: AutoBranchScope) =>
			setRepoAutoBranchesFn({
				data: {
					repo: props.repo,
					scope,
					branches: scope === "listed" ? [...props.autoBranches.branches] : [],
					skipBranches: [...props.autoBranches.skipBranches],
				},
			}),
		onSuccess: async () => {
			props.onScopeSaved();
			await props.onInvalidate();
		},
	});

	const scope = activeScope(props.autoBranches, props.listedDraft);

	return (
		<ScopeToggleGroup
			ariaLabel={msg.which_branches_aria()}
			disabled={mutation.isPending}
			error={mutation.isError ? msg.which_branches_failed() : undefined}
			hint={autoBranchHint(scope)}
			label={autoBranchLabel}
			onPick={(option) => {
				if (option === "listed" && props.autoBranches.branches.length === 0) {
					props.onPickListed();
					return;
				}
				mutation.mutate(option);
			}}
			options={AUTO_BRANCH_SCOPES}
			value={scope}
		/>
	);
}

function useSaveListedBranches(args: {
	autoBranches: AutoBranches;
	onSaved: (updated: EnabledRepo) => Promise<void>;
	repo: string;
}) {
	return useMutation({
		mutationFn: async (branches: string[]) =>
			setRepoAutoBranchesFn({
				data: {
					repo: args.repo,
					scope: "listed",
					branches,
					skipBranches: [...args.autoBranches.skipBranches],
				},
			}),
		onSuccess: args.onSaved,
	});
}

function useListedBranchesForm(props: {
	autoBranches: AutoBranches;
	onInvalidate: () => Promise<void>;
	onSaved: () => void;
	repo: string;
}) {
	const [branchText, setBranchText] = useState(
		props.autoBranches.branches.join(", "),
	);
	const [validationError, setValidationError] = useState<string | undefined>(
		undefined,
	);
	const mutation = useSaveListedBranches({
		autoBranches: props.autoBranches,
		onSaved: async (updated) => {
			setBranchText(updated.autoBranches.branches.join(", "));
			setValidationError(undefined);
			props.onSaved();
			await props.onInvalidate();
		},
		repo: props.repo,
	});

	return {
		branchText,
		busy: mutation.isPending,
		errors: [
			...(validationError === undefined ? [] : [validationError]),
			...(mutation.isError
				? [errorMessage(mutation.error, msg.listed_branches_failed())]
				: []),
		],
		onChange: (value: string) => {
			setBranchText(value);
			if (validationError !== undefined) {
				setValidationError(undefined);
			}
		},
		save: () => {
			const branches = parseBranchField(branchText);
			if (branches.length === 0) {
				setValidationError(msg.listed_branches_empty());
				return;
			}
			setValidationError(undefined);
			mutation.mutate(branches);
		},
	};
}

export function ListedBranchesField(props: {
	autoBranches: AutoBranches;
	listedDraft: boolean;
	onInvalidate: () => Promise<void>;
	onSaved: () => void;
	repo: string;
}): ReactNode {
	const { branchText, busy, errors, onChange, save } =
		useListedBranchesForm(props);

	if (props.autoBranches.scope !== "listed" && !props.listedDraft) {
		return undefined;
	}

	return (
		<SaveListField
			busy={busy}
			buttonLabel={msg.listed_branches_save()}
			className="max-w-[48ch]"
			description={msg.listed_branches_description()}
			errors={errors}
			label={msg.listed_branches_label()}
			onChange={onChange}
			onSave={save}
			placeholder={msg.listed_branches_placeholder()}
			value={branchText}
		/>
	);
}

export function SkipAutoBranchesField(props: {
	autoBranches: AutoBranches;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	const [skipText, setSkipText] = useState(
		props.autoBranches.skipBranches.join(", "),
	);
	const mutation = useMutation({
		mutationFn: async () =>
			setRepoAutoBranchesFn({
				data: {
					repo: props.repo,
					scope: props.autoBranches.scope,
					branches: [...props.autoBranches.branches],
					skipBranches: parseBranchField(skipText),
				},
			}),
		onSuccess: async (updated: EnabledRepo) => {
			setSkipText(updated.autoBranches.skipBranches.join(", "));
			await props.onInvalidate();
		},
	});

	return (
		<SaveListField
			busy={mutation.isPending}
			buttonLabel={msg.skip_save()}
			className="max-w-[48ch]"
			description={msg.skip_branches_description()}
			errors={
				mutation.isError
					? [errorMessage(mutation.error, msg.skip_branches_failed())]
					: []
			}
			label={msg.skip_branches_label()}
			onChange={setSkipText}
			onSave={() => {
				mutation.mutate();
			}}
			placeholder={msg.skip_branches_placeholder()}
			value={skipText}
		/>
	);
}

export function AutoBranchesSettings(props: {
	autoBranches: AutoBranches;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	const [listedDraft, setListedDraft] = useState(false);

	return (
		<SettingGroup title={msg.which_branches()}>
			<AutoBranchesToggle
				autoBranches={props.autoBranches}
				listedDraft={listedDraft}
				onInvalidate={props.onInvalidate}
				onPickListed={() => {
					setListedDraft(true);
				}}
				onScopeSaved={() => {
					setListedDraft(false);
				}}
				repo={props.repo}
			/>
			<ListedBranchesField
				autoBranches={props.autoBranches}
				listedDraft={listedDraft}
				onInvalidate={props.onInvalidate}
				onSaved={() => {
					setListedDraft(false);
				}}
				repo={props.repo}
			/>
			<SkipAutoBranchesField
				autoBranches={props.autoBranches}
				onInvalidate={props.onInvalidate}
				repo={props.repo}
			/>
		</SettingGroup>
	);
}
