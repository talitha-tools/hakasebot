import type { WakeMode } from "@hakasebot/core/wake/domain.ts";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { m as msg } from "#/paraglide/messages.js";
import type { EnabledRepo } from "#/web-app/domain.ts";
import { setRepoWakeModeFn } from "#/web-app/repos-rpc.ts";

import { AutoAuthorsSettings } from "./auto-authors.tsx";
import { AutoBranchesSettings } from "./auto-branches.tsx";
import { AutoReviewCadenceSettings } from "./auto-review-cadence.tsx";
import { REPO_OPTION_BUTTON_CLASS } from "./setting-classes.ts";
import { SettingGroup } from "./setting-group.tsx";

function WakeModeToggle(props: {
	mode: WakeMode;
	onInvalidate: () => Promise<void>;
	repo: string;
}): ReactNode {
	const mutation = useMutation({
		mutationFn: async (wakeMode: WakeMode) =>
			setRepoWakeModeFn({
				data: { repo: props.repo, wakeMode },
			}),
		onSuccess: props.onInvalidate,
	});
	const modes: readonly WakeMode[] = ["auto", "mention-only"];

	return (
		<div>
			<fieldset
				aria-label={msg.wake_aria()}
				className="border-ink m-0 inline-flex border-2 p-0"
			>
				{modes.map((mode) => (
					<Button
						aria-pressed={props.mode === mode}
						className={REPO_OPTION_BUTTON_CLASS}
						isDisabled={mutation.isPending}
						key={mode}
						onPress={() => {
							if (props.mode !== mode) {
								mutation.mutate(mode);
							}
						}}
						variant={props.mode === mode ? "primary" : "ghost"}
					>
						{mode === "auto" ? msg.wake_always() : msg.wake_call_me()}
					</Button>
				))}
			</fieldset>
			{mutation.isError ? (
				<p className="text-danger m-0 mt-1 text-xs">
					{msg.wake_change_failed()}
				</p>
			) : undefined}
		</div>
	);
}

export function RepoWakeSettingsBox(props: {
	onInvalidate: () => Promise<void>;
	row: EnabledRepo;
}): ReactNode {
	const repoId = props.row.repo.id;

	return (
		<div className="border-ink bg-blush/20 mb-4 max-w-[52ch] border-2 border-dashed p-3">
			<h3 className="text-ink m-0 text-base font-bold">{msg.wake_heading()}</h3>
			<p className="text-ink/60 m-0 mt-1 text-sm">{msg.wake_intro()}</p>
			<SettingGroup title={msg.wake_on()}>
				<WakeModeToggle
					mode={props.row.wakeMode}
					onInvalidate={props.onInvalidate}
					repo={repoId}
				/>
			</SettingGroup>
			<AutoAuthorsSettings
				autoAuthors={props.row.autoAuthors}
				onInvalidate={props.onInvalidate}
				repo={repoId}
			/>
			<AutoBranchesSettings
				autoBranches={props.row.autoBranches}
				onInvalidate={props.onInvalidate}
				repo={repoId}
			/>
			<AutoReviewCadenceSettings
				autoReviewCadence={props.row.autoReviewCadence}
				onInvalidate={props.onInvalidate}
				repo={repoId}
			/>
		</div>
	);
}
