import {
	AUTO_AUTHOR_SCOPES,
	AUTO_BRANCH_SCOPES,
	AUTO_REVIEW_CADENCES,
	productRepoSettingDefaults,
} from "@hakasebot/core/wake/domain.ts";
import type {
	AutoAuthorScope,
	AutoBranchScope,
	AutoReviewCadence,
	RepoSettingDefaults,
	WakeMode,
} from "@hakasebot/core/wake/domain.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { m as msg } from "#/paraglide/messages.js";
import {
	getRepoSettingDefaultsFn,
	setRepoSettingDefaultsFn,
} from "#/web-app/repos-rpc.ts";

import {
	autoAuthorHint,
	autoAuthorLabel,
	autoBranchHint,
	autoBranchLabel,
	autoReviewCadenceHint,
	autoReviewCadenceLabel,
} from "./auto-setting-copy.ts";
import { REPO_OPTION_BUTTON_CLASS } from "./setting-classes.ts";
import { SettingGroup } from "./setting-group.tsx";

function DefaultsToggleGroup<T extends string>(props: {
	ariaLabel: string;
	disabled: boolean;
	hint: string;
	label: (value: T) => string;
	onPick: (value: T) => void;
	options: readonly T[];
	value: T;
}): ReactNode {
	return (
		<div>
			<fieldset
				aria-label={props.ariaLabel}
				className="border-ink m-0 inline-flex border-2 p-0"
			>
				{props.options.map((option) => (
					<Button
						aria-pressed={props.value === option}
						className={REPO_OPTION_BUTTON_CLASS}
						isDisabled={props.disabled}
						key={option}
						onPress={() => {
							if (props.value !== option) {
								props.onPick(option);
							}
						}}
						variant={props.value === option ? "primary" : "ghost"}
					>
						{props.label(option)}
					</Button>
				))}
			</fieldset>
			<p className="text-ink/55 m-0 mt-2 max-w-[48ch] text-xs">{props.hint}</p>
		</div>
	);
}

function wakeModeLabel(mode: WakeMode): string {
	return mode === "auto" ? msg.wake_always() : msg.wake_call_me();
}

function wakeModeHint(mode: WakeMode): string {
	return mode === "auto" ? msg.wake_hint_auto() : msg.wake_hint_mention();
}

function useRepoSettingDefaults(githubUserId: string | undefined) {
	const queryClient = useQueryClient();
	const defaultsQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => getRepoSettingDefaultsFn(),
		queryKey: ["web-app", "repo-setting-defaults", githubUserId],
	});
	const mutation = useMutation({
		mutationFn: async (defaults: RepoSettingDefaults) =>
			setRepoSettingDefaultsFn({ data: defaults }),
		onSuccess: (defaults) => {
			queryClient.setQueryData(
				["web-app", "repo-setting-defaults", githubUserId],
				defaults,
			);
		},
	});

	const loadFailed = defaultsQuery.isError;
	const defaults =
		defaultsQuery.data ??
		(loadFailed ? undefined : productRepoSettingDefaults());

	return {
		controlsDisabled:
			mutation.isPending ||
			defaultsQuery.isPending ||
			loadFailed ||
			defaults === undefined,
		defaults,
		loadFailed,
		patch: (partial: Partial<RepoSettingDefaults>) => {
			if (defaultsQuery.data !== undefined) {
				mutation.mutate({ ...defaultsQuery.data, ...partial });
			}
		},
		saveFailed: mutation.isError,
	};
}

interface DefaultsFieldProps {
	defaults: RepoSettingDefaults;
	disabled: boolean;
	patch: (partial: Partial<RepoSettingDefaults>) => void;
}

function WakeModeDefaultsField(props: DefaultsFieldProps): ReactNode {
	return (
		<SettingGroup title={msg.defaults_when_wake()}>
			<DefaultsToggleGroup
				ariaLabel={msg.defaults_wake_aria()}
				disabled={props.disabled}
				hint={wakeModeHint(props.defaults.wakeMode)}
				label={wakeModeLabel}
				onPick={(wakeMode) => {
					props.patch({ wakeMode });
				}}
				options={["auto", "mention-only"] as const}
				value={props.defaults.wakeMode}
			/>
		</SettingGroup>
	);
}

function AutoAuthorsDefaultsField(props: DefaultsFieldProps): ReactNode {
	return (
		<SettingGroup title={msg.whose_prs()}>
			<DefaultsToggleGroup
				ariaLabel={msg.defaults_whose_aria()}
				disabled={props.disabled}
				hint={autoAuthorHint(props.defaults.autoAuthorScope)}
				label={autoAuthorLabel}
				onPick={(autoAuthorScope: AutoAuthorScope) => {
					props.patch({ autoAuthorScope });
				}}
				options={AUTO_AUTHOR_SCOPES}
				value={props.defaults.autoAuthorScope}
			/>
		</SettingGroup>
	);
}

function AutoBranchesDefaultsField(props: DefaultsFieldProps): ReactNode {
	return (
		<SettingGroup title={msg.which_branches()}>
			<DefaultsToggleGroup
				ariaLabel={msg.defaults_branches_aria()}
				disabled={props.disabled}
				hint={
					props.defaults.autoBranchScope === "listed"
						? msg.defaults_listed_hint()
						: autoBranchHint(props.defaults.autoBranchScope)
				}
				label={autoBranchLabel}
				onPick={(autoBranchScope: AutoBranchScope) => {
					props.patch({ autoBranchScope });
				}}
				options={AUTO_BRANCH_SCOPES}
				value={props.defaults.autoBranchScope}
			/>
		</SettingGroup>
	);
}

function AutoReviewCadenceDefaultsField(props: DefaultsFieldProps): ReactNode {
	return (
		<SettingGroup title={msg.how_often()}>
			<DefaultsToggleGroup
				ariaLabel={msg.defaults_cadence_aria()}
				disabled={props.disabled}
				hint={autoReviewCadenceHint(props.defaults.autoReviewCadence)}
				label={autoReviewCadenceLabel}
				onPick={(autoReviewCadence: AutoReviewCadence) => {
					props.patch({ autoReviewCadence });
				}}
				options={AUTO_REVIEW_CADENCES}
				value={props.defaults.autoReviewCadence}
			/>
		</SettingGroup>
	);
}

function DefaultsPanelHeader(props: {
	loadFailed: boolean;
	onBack: () => void;
	saveFailed: boolean;
}): ReactNode {
	return (
		<>
			<Button className="mb-4" variant="ghost" onPress={props.onBack}>
				{msg.repos_back()}
			</Button>
			<h2 className="text-accent-strong ink-outline m-0 text-3xl font-bold">
				{msg.defaults_heading()}
			</h2>
			<p className="text-ink/60 m-0 mt-2 max-w-[48ch] text-sm">
				{msg.defaults_intro()}
			</p>
			{props.loadFailed ? (
				<p className="text-danger m-0 mt-2 text-xs">
					{msg.defaults_load_failed()}
				</p>
			) : undefined}
			{props.saveFailed ? (
				<p className="text-danger m-0 mt-2 text-xs">
					{msg.defaults_save_failed()}
				</p>
			) : undefined}
		</>
	);
}

export function RepoSettingDefaultsPanel(props: {
	githubUserId: string | undefined;
	onBack: () => void;
}): ReactNode {
	const { controlsDisabled, defaults, loadFailed, patch, saveFailed } =
		useRepoSettingDefaults(props.githubUserId);

	return (
		<div>
			<DefaultsPanelHeader
				loadFailed={loadFailed}
				onBack={props.onBack}
				saveFailed={saveFailed}
			/>
			{defaults === undefined ? undefined : (
				<>
					<WakeModeDefaultsField
						defaults={defaults}
						disabled={controlsDisabled}
						patch={patch}
					/>
					<AutoAuthorsDefaultsField
						defaults={defaults}
						disabled={controlsDisabled}
						patch={patch}
					/>
					<AutoBranchesDefaultsField
						defaults={defaults}
						disabled={controlsDisabled}
						patch={patch}
					/>
					<AutoReviewCadenceDefaultsField
						defaults={defaults}
						disabled={controlsDisabled}
						patch={patch}
					/>
				</>
			)}
		</div>
	);
}
