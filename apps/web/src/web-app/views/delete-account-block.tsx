import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useMutation } from "@tanstack/react-query";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { authClient } from "#/lib/auth-client";
import { m as msg } from "#/paraglide/messages.js";
import { clearBrowserAccountLocalState as clearBrowserAccountLocalStateImpl } from "#/vault/session-key.client.ts";
import {
	deleteAccountFn,
	previewAccountDeletionFn,
} from "#/web-app/account-deletion-rpc.ts";
import type { AccountDeletionPreview } from "#/web-app/account-deletion-store.ts";
import { formatRepoRef } from "#/web-app/domain.ts";

import { ConfirmCancelButtons } from "./confirm-cancel.tsx";

const clearBrowserAccountLocalState = createClientOnlyFn(
	clearBrowserAccountLocalStateImpl,
);

async function eraseAccount(
	githubUserId: string | undefined,
	preview: AccountDeletionPreview | undefined,
) {
	if (githubUserId === undefined) {
		throw new Error(msg.lab_not_loaded());
	}
	if (preview === undefined) {
		throw new Error(msg.peek_first());
	}
	await deleteAccountFn();
	clearBrowserAccountLocalState(githubUserId);
	await authClient.signOut();
	globalThis.location.assign("/");
}

function useDeleteAccount(githubUserId: string | undefined) {
	const [preview, setPreview] = useState<AccountDeletionPreview | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | undefined>(undefined);

	const previewMutation = useMutation({
		mutationFn: async () => previewAccountDeletionFn(),
		onError: (caught: unknown) => {
			setPreview(undefined);
			setError(errorMessage(caught, msg.erase_peek_failed()));
		},
		onSuccess: (value) => {
			setError(undefined);
			setPreview(value);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => eraseAccount(githubUserId, preview),
		onError: (caught: unknown) => {
			setError(errorMessage(caught, msg.erase_failed()));
		},
	});

	return {
		cancel: () => {
			setPreview(undefined);
			setError(undefined);
		},
		confirm: () => {
			deleteMutation.mutate();
		},
		deleting: deleteMutation.isPending,
		error,
		peek: () => {
			previewMutation.mutate();
		},
		peeking: previewMutation.isPending,
		preview,
	};
}

function DeleteAccountPreview(props: {
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	preview: AccountDeletionPreview;
}): ReactNode {
	return (
		<div className="mt-4">
			<dl className="text-ink m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="font-bold">{msg.erase_logins()}</dt>
				<dd className="m-0">{props.preview.vaultAccountCount}</dd>
				<dt className="font-bold">{msg.erase_brains()}</dt>
				<dd className="m-0">{props.preview.modelSlotCount}</dd>
				<dt className="font-bold">{msg.erase_repos()}</dt>
				<dd className="m-0">{props.preview.enabledRepoCount}</dd>
				<dt className="font-bold">{msg.erase_claims()}</dt>
				<dd className="m-0">{props.preview.repoClaimCount}</dd>
				<dt className="font-bold">{msg.erase_wakes()}</dt>
				<dd className="m-0">{props.preview.wakeRunCount}</dd>
				<dt className="font-bold">{msg.erase_house()}</dt>
				<dd className="m-0">
					{props.preview.homeRepo === undefined
						? msg.erase_house_none()
						: formatRepoRef(props.preview.homeRepo)}
				</dd>
			</dl>
			<p className="text-ink/75 m-0 mt-3 max-w-[48ch] text-sm">
				{msg.erase_warning()}
			</p>
			<ConfirmCancelButtons
				busy={props.busy}
				busyLabel={msg.erase_busy()}
				confirmLabel={msg.erase_confirm()}
				onCancel={props.onCancel}
				onConfirm={props.onConfirm}
			/>
		</div>
	);
}

export function DeleteAccountBlock(props: {
	githubUserId: string | undefined;
}): ReactNode {
	const { cancel, confirm, deleting, error, peek, peeking, preview } =
		useDeleteAccount(props.githubUserId);

	return (
		<div className="border-ink mt-6 border-2 px-4 py-4">
			<h3 className="text-ink m-0 text-lg font-bold">{msg.erase_heading()}</h3>
			<p className="text-ink/75 m-0 mt-2 max-w-[48ch] text-sm">
				{msg.erase_intro()}
			</p>
			{preview === undefined ? (
				<div className="mt-4">
					<Button variant="ghost" isDisabled={peeking} onPress={peek}>
						{peeking ? msg.rotate_peeking() : msg.erase_peek()}
					</Button>
				</div>
			) : (
				<DeleteAccountPreview
					busy={deleting}
					onCancel={cancel}
					onConfirm={confirm}
					preview={preview}
				/>
			)}
			{error === undefined ? undefined : (
				<div className="mt-3">
					<ErrorMessage>{error}</ErrorMessage>
				</div>
			)}
		</div>
	);
}
