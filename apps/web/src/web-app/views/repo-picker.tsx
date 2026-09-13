import type { RepoRef, RepoRefParts } from "@hakasebot/core/domain.ts";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { TextField } from "#/components/ui/text-field.tsx";
import { filterReposByQuery } from "#/lab/filter-repos.ts";
import { m as msg } from "#/paraglide/messages.js";
import { formatRepoRef } from "#/web-app/domain.ts";

import type { EnableRepoAction, useRepoPicker } from "./use-repos-panel.ts";
import { typedRepoFallback } from "./use-repos-panel.ts";

function RepoPickerList(props: {
	enable: EnableRepoAction;
	enabledKeys: ReadonlySet<string>;
	visible: readonly RepoRef[];
}): ReactNode {
	return (
		<div className="border-ink mt-3 max-h-48 max-w-[48ch] overflow-auto border-2">
			<ul className="m-0 list-none p-0">
				{props.visible.map((repo) => {
					const label = formatRepoRef(repo);
					const already = props.enabledKeys.has(repo.id);
					return (
						<li key={label} className="border-ink border-b-2 last:border-b-0">
							<Button
								variant="ghost"
								className="w-full justify-start border-0 px-2 py-1.5 text-left"
								isDisabled={already || props.enable.enabling}
								onPress={() => {
									props.enable.run(repo);
								}}
							>
								{already ? msg.repos_already_in({ repo: label }) : label}
							</Button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function RepoPickerTypedFallback(props: {
	enable: EnableRepoAction;
	parts: RepoRefParts;
}): ReactNode {
	const label = formatRepoRef(props.parts);
	return (
		<div className="mt-3">
			<Button
				variant="ghost"
				className="border-ink max-w-[48ch] justify-start border-2 px-2 py-1.5 text-left"
				isDisabled={props.enable.enabling}
				onPress={() => {
					props.enable.runTyped(props.parts);
				}}
			>
				{label}
			</Button>
		</div>
	);
}

function RepoPickerResults(props: {
	enable: EnableRepoAction;
	enabledKeys: ReadonlySet<string>;
	picker: ReturnType<typeof useRepoPicker>;
	repos: RepoRef[];
}): ReactNode {
	const { setQuery } = props.picker;
	const visible = filterReposByQuery({
		query: props.picker.query,
		repos: props.repos,
	});
	const typed = typedRepoFallback({
		query: props.picker.query,
		repos: props.repos,
	});
	return (
		<>
			<div className="mt-3 max-w-[48ch]">
				<TextField
					label={msg.repos_filter()}
					value={props.picker.query}
					onChange={setQuery}
					autoComplete="off"
					spellCheck={false}
					placeholder={msg.repos_filter_placeholder()}
				/>
			</div>
			{visible.length === 0 ? (
				<p className="text-ink/55 m-0 mt-3">
					{props.repos.length === 0
						? msg.repos_none_granted()
						: msg.repos_none_match()}
				</p>
			) : (
				<RepoPickerList
					enable={props.enable}
					enabledKeys={props.enabledKeys}
					visible={visible}
				/>
			)}
			{typed === undefined ? undefined : (
				<RepoPickerTypedFallback enable={props.enable} parts={typed} />
			)}
		</>
	);
}

export function AddRepoSection(props: {
	enable: EnableRepoAction;
	enabledKeys: ReadonlySet<string>;
	picker: ReturnType<typeof useRepoPicker>;
}): ReactNode {
	return (
		<div className="mt-6">
			<h3 className="text-ink m-0 text-lg font-bold">
				{msg.repos_add_heading()}
			</h3>
			<p className="text-ink/60 m-0 mt-1 text-sm">{msg.repos_add_hint()}</p>
			{props.picker.error === undefined ? undefined : (
				<div className="mt-3">
					<ErrorMessage>{props.picker.error}</ErrorMessage>
				</div>
			)}
			{props.enable.error === undefined ? undefined : (
				<div className="mt-3">
					<ErrorMessage>{props.enable.error}</ErrorMessage>
				</div>
			)}
			{props.picker.repos === undefined ? (
				<p className="text-ink/50 m-0 mt-3">{msg.repos_looking()}</p>
			) : (
				<RepoPickerResults
					enable={props.enable}
					enabledKeys={props.enabledKeys}
					picker={props.picker}
					repos={props.picker.repos}
				/>
			)}
		</div>
	);
}
