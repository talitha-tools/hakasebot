import type { EngineKind } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { encryptCredential } from "@hakasebot/core/vault/crypto.ts";
import { parseCredentialPaste } from "@hakasebot/core/vault/parse-credential.ts";
import { useMutation } from "@tanstack/react-query";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useState } from "react";

import { m as msg } from "#/paraglide/messages.js";
import { loadEncryptionKey as loadEncryptionKeyImpl } from "#/vault/session-key.client.ts";
import { saveVaultAccountFn } from "#/web-app/accounts-rpc.ts";

const loadEncryptionKey = createClientOnlyFn(loadEncryptionKeyImpl);

async function saveSealedAccount(args: {
	draft: string;
	engine: EngineKind;
	githubUserId: string | undefined;
	label: string;
}) {
	if (args.githubUserId === undefined) {
		throw new Error(msg.lab_not_loaded());
	}
	const encryptionKey = loadEncryptionKey(args.githubUserId);
	if (encryptionKey === undefined) {
		throw new Error(msg.accounts_key_missing());
	}
	const parsed = parseCredentialPaste({ engine: args.engine, raw: args.draft });
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	const sealed = await encryptCredential({
		accountId: parsed.value.id,
		plaintext: parsed.value.secretValue,
		encryptionKey,
	});
	return saveVaultAccountFn({
		data: {
			engine: args.engine,
			label: args.label,
			sealed: {
				accountId: sealed.accountId,
				ciphertext: sealed.ciphertext,
				iv: sealed.iv,
			},
		},
	});
}

export function useAddAccountForm(
	githubUserId: string | undefined,
	onSaved: () => Promise<void>,
) {
	const [engine, setEngine] = useState<EngineKind>("claude");
	const [label, setLabel] = useState("");
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | undefined>(undefined);
	/** Bumps after seal so VendorLoginBlock remounts to idle. */
	const [loginRemountKey, setLoginRemountKey] = useState(0);

	const saveMutation = useMutation({
		mutationFn: async () =>
			saveSealedAccount({ draft, engine, githubUserId, label }),
		onError: (caught: unknown) => {
			setError(errorMessage(caught, msg.accounts_save_failed()));
		},
		onSuccess: async () => {
			setDraft("");
			setLabel("");
			setError(undefined);
			setLoginRemountKey((key) => key + 1);
			await onSaved();
		},
	});

	return {
		busy: saveMutation.isPending,
		draft,
		engine,
		error,
		label,
		loginRemountKey,
		setDraft,
		setEngine: (next: EngineKind) => {
			setEngine(next);
			setDraft("");
		},
		setLabel,
		submit: () => {
			if (!saveMutation.isPending) {
				saveMutation.mutate();
			}
		},
	};
}
