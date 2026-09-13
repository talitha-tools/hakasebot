import { AUTO_REVIEW_CADENCES } from "@hakasebot/core/wake/domain.ts";
import type { AutoReviewCadence } from "@hakasebot/core/wake/domain.ts";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { m as msg } from "#/paraglide/messages.js";
import { setRepoAutoReviewCadenceFn } from "#/web-app/repos-rpc.ts";

import {
	autoReviewCadenceHint,
	autoReviewCadenceLabel,
} from "./auto-setting-copy.ts";
import { ScopeToggleGroup } from "./scope-toggle.tsx";
import { SettingGroup } from "./setting-group.tsx";

export function AutoReviewCadenceToggle(props: {
	autoReviewCadence: AutoReviewCadence;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	const mutation = useMutation({
		mutationFn: async (autoReviewCadence: AutoReviewCadence) =>
			setRepoAutoReviewCadenceFn({
				data: { autoReviewCadence, repo: props.repo },
			}),
		onSuccess: props.onInvalidate,
	});

	return (
		<ScopeToggleGroup
			ariaLabel={msg.how_often_aria()}
			disabled={mutation.isPending}
			error={mutation.isError ? msg.how_often_failed() : undefined}
			hint={autoReviewCadenceHint(props.autoReviewCadence)}
			label={autoReviewCadenceLabel}
			onPick={(cadence) => {
				mutation.mutate(cadence);
			}}
			options={AUTO_REVIEW_CADENCES}
			value={props.autoReviewCadence}
		/>
	);
}

export function AutoReviewCadenceSettings(props: {
	autoReviewCadence: AutoReviewCadence;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	return (
		<SettingGroup title={msg.how_often()}>
			<AutoReviewCadenceToggle
				autoReviewCadence={props.autoReviewCadence}
				onInvalidate={props.onInvalidate}
				repo={props.repo}
			/>
		</SettingGroup>
	);
}
