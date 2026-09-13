import type { EncryptionKey } from "@hakasebot/core/vault/domain.ts";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { downloadEncryptionKey } from "#/vault/download-key.ts";
import { exportEncryptionKey as exportEncryptionKeyImpl } from "#/vault/session-key.client.ts";

const exportEncryptionKey = createClientOnlyFn(exportEncryptionKeyImpl);

function KeyExportControls(props: {
	copied: boolean;
	copyError: string | undefined;
	currentKey: EncryptionKey;
	onCopy: () => void;
}): ReactNode {
	return (
		<>
			<p className="text-ink/75 m-0 mt-2 max-w-[48ch] text-sm">
				{msg.key_export_intro()}
			</p>
			<pre className="border-ink bg-coat mt-4 overflow-x-auto border-2 px-3 py-3 break-all whitespace-pre-wrap">
				{props.currentKey}
			</pre>
			<div className="mt-4 flex flex-col items-start gap-3">
				<div className="flex flex-wrap gap-2">
					<Button variant="ghost" onPress={props.onCopy}>
						{props.copied ? msg.ceremony_copied() : msg.ceremony_copy()}
					</Button>
					<Button
						variant="ghost"
						onPress={() => {
							downloadEncryptionKey(props.currentKey);
						}}
					>
						{msg.key_download()}
					</Button>
				</div>
				{props.copyError === undefined ? undefined : (
					<ErrorMessage>{props.copyError}</ErrorMessage>
				)}
			</div>
		</>
	);
}

export function EncryptionKeyExportBlock(props: {
	githubUserId: string | undefined;
}): ReactNode {
	const [copied, setCopied] = useState(false);
	const [copyError, setCopyError] = useState<string | undefined>(undefined);
	const currentKey =
		props.githubUserId === undefined
			? undefined
			: exportEncryptionKey(props.githubUserId);

	async function handleCopy() {
		if (currentKey === undefined) {
			return;
		}
		setCopyError(undefined);
		try {
			await navigator.clipboard.writeText(currentKey);
			setCopied(true);
		} catch {
			setCopyError(msg.ceremony_copy_failed());
		}
	}

	return (
		<div className="border-ink mt-6 border-2 px-4 py-4">
			<h3 className="text-ink m-0 text-lg font-bold">
				{msg.key_export_heading()}
			</h3>
			{currentKey === undefined ? (
				<p className="text-ink/75 m-0 mt-2 max-w-[48ch] text-sm">
					{msg.key_export_missing()}
				</p>
			) : (
				<KeyExportControls
					copied={copied}
					copyError={copyError}
					currentKey={currentKey}
					onCopy={() => {
						void handleCopy();
					}}
				/>
			)}
		</div>
	);
}
