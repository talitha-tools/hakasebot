import { errorMessage } from "@hakasebot/core/error-message.ts";
import type { RotateVaultPreview } from "@hakasebot/core/vault/store.ts";
import { useMutation } from "@tanstack/react-query";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useState } from "react";

import { m as msg } from "#/paraglide/messages.js";
import { previewRotateFn } from "#/web-app/rotate-rpc.ts";
import { runEncryptionKeyRotate as runEncryptionKeyRotateImpl } from "#/web-app/rotate.client.ts";

const runEncryptionKeyRotate = createClientOnlyFn(
	async (args: { githubUserId: string; preview: RotateVaultPreview }) =>
		runEncryptionKeyRotateImpl(args),
);

async function rotateWithPreview(
	githubUserId: string | undefined,
	preview: RotateVaultPreview | undefined,
) {
	if (githubUserId === undefined) {
		throw new Error(msg.lab_not_loaded());
	}
	if (preview === undefined) {
		throw new Error(msg.peek_first());
	}
	await runEncryptionKeyRotate({ githubUserId, preview });
	globalThis.location.reload();
}

export function useRotateKey(githubUserId: string | undefined) {
	const [preview, setPreview] = useState<RotateVaultPreview | undefined>(
		undefined,
	);
	const [error, setError] = useState<string | undefined>(undefined);

	const previewMutation = useMutation({
		mutationFn: async () => previewRotateFn(),
		onError: (caught: unknown) => {
			setPreview(undefined);
			setError(errorMessage(caught, msg.rotate_peek_failed()));
		},
		onSuccess: (value) => {
			setError(undefined);
			setPreview(value);
		},
	});

	const rotateMutation = useMutation({
		mutationFn: async () => rotateWithPreview(githubUserId, preview),
		onError: (caught: unknown) => {
			setError(errorMessage(caught, msg.rotate_failed()));
		},
	});

	return {
		cancel: () => {
			setPreview(undefined);
			setError(undefined);
		},
		confirm: () => {
			rotateMutation.mutate();
		},
		error,
		peek: () => {
			previewMutation.mutate();
		},
		peeking: previewMutation.isPending,
		preview,
		rotating: rotateMutation.isPending,
	};
}
