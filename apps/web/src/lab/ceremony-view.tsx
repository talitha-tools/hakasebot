import type { EncryptionKey } from "@hakasebot/core/vault/domain.ts";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { writeCeremonyAck as writeCeremonyAckImpl } from "#/vault/session-key.client.ts";

const writeCeremonyAck = createClientOnlyFn(writeCeremonyAckImpl);

function CeremonyActions(props: {
	encryptionKey: EncryptionKey;
	onConfirm: () => void;
}): ReactNode {
	const [copied, setCopied] = useState(false);
	const [saved, setSaved] = useState(false);
	const [copyError, setCopyError] = useState<string | undefined>(undefined);

	async function handleCopy() {
		setCopyError(undefined);
		try {
			await navigator.clipboard.writeText(props.encryptionKey);
			setCopied(true);
		} catch {
			setCopyError(msg.ceremony_copy_failed());
		}
	}

	return (
		<div className="mt-4 flex flex-col items-start gap-3">
			<Button
				variant="ghost"
				onPress={() => {
					void handleCopy();
				}}
			>
				{copied ? msg.ceremony_copied() : msg.ceremony_copy()}
			</Button>
			{copyError === undefined ? undefined : (
				<ErrorMessage>{copyError}</ErrorMessage>
			)}
			<Checkbox isSelected={saved} onChange={setSaved}>
				{msg.ceremony_saved_tick()}
			</Checkbox>
			<Button isDisabled={!saved} onPress={props.onConfirm}>
				{msg.ceremony_enter()}
			</Button>
		</div>
	);
}

export function CeremonyView(props: {
	githubUserId: string;
	onOpened: (key: EncryptionKey) => void;
	encryptionKey: EncryptionKey;
}): ReactNode {
	function handleConfirm() {
		writeCeremonyAck(props.githubUserId);
		props.onOpened(props.encryptionKey);
	}

	return (
		<main className="mx-auto flex min-h-dvh max-w-[42rem] flex-col justify-center px-4 py-8 sm:px-6">
			<Label>{msg.gate_key_label()}</Label>
			<h1 className="text-accent-strong ink-outline mt-1 text-4xl font-bold">
				{msg.ceremony_heading()}
			</h1>
			<p className="text-ink/75 mt-3 mb-0 max-w-[48ch]">
				{msg.ceremony_body()}
			</p>
			<pre className="border-ink bg-coat mt-6 overflow-x-auto border-2 px-3 py-3 break-all whitespace-pre-wrap">
				{props.encryptionKey}
			</pre>
			<CeremonyActions
				encryptionKey={props.encryptionKey}
				onConfirm={handleConfirm}
			/>
		</main>
	);
}
