import { errorMessage } from "@hakasebot/core/error-message.ts";
import { AUTO_AUTHOR_SCOPES } from "@hakasebot/core/wake/domain.ts";
import type {
	AutoAuthors,
	AutoAuthorScope,
} from "@hakasebot/core/wake/domain.ts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { m as msg } from "#/paraglide/messages.js";
import type { EnabledRepo } from "#/web-app/domain.ts";
import { setRepoAutoAuthorsFn } from "#/web-app/repos-rpc.ts";

import { autoAuthorHint, autoAuthorLabel } from "./auto-setting-copy.ts";
import { SaveListField } from "./save-list-field.tsx";
import { ScopeToggleGroup } from "./scope-toggle.tsx";
import { SettingGroup } from "./setting-group.tsx";

function parseSkipLoginField(value: string): string[] {
	return value
		.split(/[,\s]+/u)
		.map((login) => login.trim())
		.filter((login) => login.length > 0);
}

export function AutoAuthorsToggle(props: {
	autoAuthors: AutoAuthors;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	const mutation = useMutation({
		mutationFn: async (scope: AutoAuthorScope) =>
			setRepoAutoAuthorsFn({
				data: {
					repo: props.repo,
					scope,
					skipLogins: [...props.autoAuthors.skipLogins],
				},
			}),
		onSuccess: props.onInvalidate,
	});

	return (
		<ScopeToggleGroup
			ariaLabel={msg.whose_prs_aria()}
			disabled={mutation.isPending}
			error={mutation.isError ? msg.whose_prs_failed() : undefined}
			hint={autoAuthorHint(props.autoAuthors.scope)}
			label={autoAuthorLabel}
			onPick={(scope) => {
				mutation.mutate(scope);
			}}
			options={AUTO_AUTHOR_SCOPES}
			value={props.autoAuthors.scope}
		/>
	);
}

export function SkipAutoAuthorsField(props: {
	autoAuthors: AutoAuthors;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	const [skipText, setSkipText] = useState(
		props.autoAuthors.skipLogins.join(", "),
	);
	const mutation = useMutation({
		mutationFn: async () =>
			setRepoAutoAuthorsFn({
				data: {
					repo: props.repo,
					scope: props.autoAuthors.scope,
					skipLogins: parseSkipLoginField(skipText),
				},
			}),
		onSuccess: async (updated: EnabledRepo) => {
			setSkipText(updated.autoAuthors.skipLogins.join(", "));
			await props.onInvalidate();
		},
	});

	return (
		<SaveListField
			busy={mutation.isPending}
			buttonLabel={msg.skip_save()}
			description={msg.skip_logins_description()}
			errors={
				mutation.isError
					? [errorMessage(mutation.error, msg.skip_logins_failed())]
					: []
			}
			label={msg.skip_logins_label()}
			onChange={setSkipText}
			onSave={() => {
				mutation.mutate();
			}}
			placeholder={msg.skip_logins_placeholder()}
			value={skipText}
		/>
	);
}

export function AutoAuthorsSettings(props: {
	autoAuthors: AutoAuthors;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	return (
		<SettingGroup title={msg.whose_prs()}>
			<AutoAuthorsToggle
				autoAuthors={props.autoAuthors}
				onInvalidate={props.onInvalidate}
				repo={props.repo}
			/>
			<SkipAutoAuthorsField
				autoAuthors={props.autoAuthors}
				onInvalidate={props.onInvalidate}
				repo={props.repo}
			/>
		</SettingGroup>
	);
}
