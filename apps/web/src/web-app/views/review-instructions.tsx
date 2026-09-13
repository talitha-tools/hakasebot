import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { TextAreaField } from "#/components/ui/text-area.tsx";
import { TextField } from "#/components/ui/text-field.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { setRepoReviewInstructionsFn } from "#/web-app/repos-rpc.ts";

function parseIgnorePaths(value: string): string[] {
	return value
		.split(/[,\n]/u)
		.map((path) => path.trim())
		.filter((path) => path.length > 0);
}

async function saveInstructions(args: {
	ignorePaths: string;
	prompt: string;
	repo: string;
}) {
	const savedPrompt = args.prompt.trim();
	const savedIgnorePaths = parseIgnorePaths(args.ignorePaths);
	return setRepoReviewInstructionsFn({
		data: {
			repo: args.repo,
			...(savedPrompt.length === 0 ? {} : { prompt: savedPrompt }),
			...(savedIgnorePaths.length === 0
				? {}
				: { ignorePaths: savedIgnorePaths }),
		},
	});
}

function ReviewInstructionsForm(props: {
	busy: boolean;
	error: string | undefined;
	ignorePaths: string;
	onChangeIgnorePaths: (value: string) => void;
	onChangePrompt: (value: string) => void;
	onSave: () => void;
	prompt: string;
	saved: boolean;
}): ReactNode {
	return (
		<div className="mt-3 grid gap-3">
			<TextAreaField
				description={msg.notes_prompt_description()}
				isDisabled={props.busy}
				label={msg.notes_prompt_label()}
				onChange={props.onChangePrompt}
				placeholder={msg.notes_prompt_placeholder()}
				rows={4}
				value={props.prompt}
			/>
			<TextField
				description={msg.notes_skip_description()}
				isDisabled={props.busy}
				label={msg.notes_skip_label()}
				onChange={props.onChangeIgnorePaths}
				placeholder={msg.notes_skip_placeholder()}
				value={props.ignorePaths}
			/>
			<div>
				<Button isDisabled={props.busy} onPress={props.onSave}>
					{props.busy ? msg.saving_ellipsis() : msg.notes_save()}
				</Button>
			</div>
			{props.error === undefined ? undefined : (
				<ErrorMessage>{props.error}</ErrorMessage>
			)}
			{props.saved ? (
				<p className="text-ink/60 m-0 text-sm">{msg.notes_saved()}</p>
			) : undefined}
		</div>
	);
}

export function ReviewInstructions(props: {
	ignorePaths: readonly string[] | undefined;
	onSaved: () => Promise<void>;
	prompt: string | undefined;
	repo: string;
}): ReactNode {
	const [prompt, setPrompt] = useState(props.prompt ?? "");
	const [ignorePaths, setIgnorePaths] = useState(
		props.ignorePaths?.join(", ") ?? "",
	);

	const saveMutation = useMutation({
		mutationFn: async () =>
			saveInstructions({ ignorePaths, prompt, repo: props.repo }),
		onSuccess: props.onSaved,
	});

	return (
		<div className="border-ink bg-blush/20 mt-5 max-w-[52ch] border-2 border-dashed p-3">
			<h4 className="text-ink m-0 text-base font-bold">
				{msg.notes_heading()}
			</h4>
			<p className="text-ink/60 m-0 mt-1 text-sm">{msg.notes_intro()}</p>
			<ReviewInstructionsForm
				busy={saveMutation.isPending}
				error={
					saveMutation.isError
						? errorMessage(saveMutation.error, msg.notes_save_failed())
						: undefined
				}
				ignorePaths={ignorePaths}
				onChangeIgnorePaths={setIgnorePaths}
				onChangePrompt={setPrompt}
				onSave={() => {
					saveMutation.mutate();
				}}
				prompt={prompt}
				saved={saveMutation.isSuccess}
			/>
		</div>
	);
}
