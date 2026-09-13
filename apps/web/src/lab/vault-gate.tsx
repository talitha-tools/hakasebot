import type {
	VaultGate,
	VaultGateSnapshot,
	EncryptionKey,
} from "@hakasebot/core/vault/domain.ts";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { TextAreaField } from "#/components/ui/text-area.tsx";
import { CeremonyView } from "#/lab/ceremony-view.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { vaultGateSnapshotFn } from "#/vault/gate-rpc.ts";
import {
	parseImportedEncryptionKey as parseImportedEncryptionKeyImpl,
	prepareVaultGate as prepareVaultGateImpl,
	validateImportedKey as validateImportedKeyImpl,
} from "#/vault/gate.client.ts";
import {
	importEncryptionKey as importEncryptionKeyImpl,
	loadEncryptionKey as loadEncryptionKeyImpl,
	readCeremonyAck as readCeremonyAckImpl,
	writeCeremonyAck as writeCeremonyAckImpl,
} from "#/vault/session-key.client.ts";
import { RotateKeyPanel } from "#/web-app/views/rotate-key-panel.tsx";

// These run only in effects and event handlers, so the SSR bundle can drop the
// .client modules behind createClientOnlyFn stubs.
const parseImportedEncryptionKey = createClientOnlyFn(
	parseImportedEncryptionKeyImpl,
);
const prepareVaultGate = createClientOnlyFn(prepareVaultGateImpl);
const validateImportedKey = createClientOnlyFn(validateImportedKeyImpl);
const importEncryptionKey = createClientOnlyFn(importEncryptionKeyImpl);
const loadEncryptionKey = createClientOnlyFn(loadEncryptionKeyImpl);
const readCeremonyAck = createClientOnlyFn(readCeremonyAckImpl);
const writeCeremonyAck = createClientOnlyFn(writeCeremonyAckImpl);

function useImportedKeyUnlock(props: {
	githubUserId: string;
	onOpened: (key: EncryptionKey) => void;
	sample: VaultGateSnapshot["sample"];
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | undefined>(undefined);

	async function unlock(raw: string) {
		if (busy) {
			return;
		}
		setError(undefined);
		const parsed = parseImportedEncryptionKey(raw);
		if (parsed.kind === "invalid") {
			setError(parsed.message);
			return;
		}
		if (props.sample === undefined) {
			setError(msg.import_no_sample());
			return;
		}
		setBusy(true);
		try {
			const checked = await validateImportedKey({
				key: parsed.value,
				sealed: props.sample,
			});
			if (checked.kind === "invalid") {
				setError(checked.message);
			} else {
				importEncryptionKey({
					githubUserId: props.githubUserId,
					key: checked.value,
				});
				writeCeremonyAck(props.githubUserId);
				props.onOpened(checked.value);
			}
		} catch {
			setBusy(false);
			return;
		}
		setBusy(false);
	}

	return { busy, error, unlock };
}

function ImportView(props: {
	githubUserId: string;
	onOpened: (key: EncryptionKey) => void;
	sample: VaultGateSnapshot["sample"];
}): ReactNode {
	const [raw, setRaw] = useState("");
	const { busy, error, unlock } = useImportedKeyUnlock(props);

	return (
		<main className="mx-auto flex min-h-dvh max-w-[42rem] flex-col justify-center px-4 py-8 sm:px-6">
			<Label>{msg.gate_key_label()}</Label>
			<h1 className="text-accent-strong ink-outline mt-1 text-4xl font-bold">
				{msg.import_heading()}
			</h1>
			<p className="text-ink/75 mt-3 mb-0 max-w-[48ch]">{msg.import_body()}</p>
			<form
				className="mt-6 flex flex-col items-start gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					void unlock(raw);
				}}
			>
				<TextAreaField
					label={msg.import_key_label()}
					value={raw}
					onChange={setRaw}
					rows={4}
					autoComplete="off"
					spellCheck={false}
				/>
				{error === undefined ? undefined : <ErrorMessage>{error}</ErrorMessage>}
				<Button isDisabled={busy || raw.trim().length === 0} type="submit">
					{busy ? msg.import_checking() : msg.import_open()}
				</Button>
			</form>
			<RotateKeyPanel
				className="mt-8"
				confirmLabel={msg.import_lost_confirm()}
				githubUserId={props.githubUserId}
				heading={msg.import_lost_heading()}
				headingTag="h2"
				intro={msg.import_lost_intro()}
				peekLabel={msg.import_lost_peek()}
			/>
		</main>
	);
}

export function VaultGateView(props: {
	gate: Exclude<VaultGate, { kind: "open" }>;
	onOpened: (key: EncryptionKey) => void;
	snapshot: VaultGateSnapshot;
}): ReactNode {
	if (props.gate.kind === "ceremony") {
		return (
			<CeremonyView
				githubUserId={props.snapshot.githubUserId}
				onOpened={props.onOpened}
				encryptionKey={props.gate.key}
			/>
		);
	}
	return (
		<ImportView
			githubUserId={props.snapshot.githubUserId}
			onOpened={props.onOpened}
			sample={props.snapshot.sample}
		/>
	);
}

// Runs the client-side half of the gate decision: try the session key against
// the sealed sample, then let prepareVaultGate pick ceremony/import/open.
async function resolveClientGate(next: VaultGateSnapshot): Promise<VaultGate> {
	const sessionKey = loadEncryptionKey(next.githubUserId);
	let localKeyUnlocks: boolean | undefined;
	if (sessionKey !== undefined && next.sample !== undefined) {
		const checked = await validateImportedKey({
			key: sessionKey,
			sealed: next.sample,
		});
		localKeyUnlocks = checked.kind === "ok";
	}
	const prepared = prepareVaultGate({
		ceremonyAcked: readCeremonyAck(next.githubUserId),
		hasCiphertext: next.accountCount > 0,
		sessionKey,
		...(localKeyUnlocks === undefined ? {} : { localKeyUnlocks }),
	});
	if (prepared.sessionKey !== undefined && sessionKey === undefined) {
		importEncryptionKey({
			githubUserId: next.githubUserId,
			key: prepared.sessionKey,
		});
	}
	return prepared.gate;
}

function useVaultGate() {
	const [snapshot, setSnapshot] = useState<VaultGateSnapshot | undefined>(
		undefined,
	);
	const [gate, setGate] = useState<VaultGate | undefined>(undefined);
	const [loadError, setLoadError] = useState<string | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		async function loadSnapshot() {
			try {
				const next = await vaultGateSnapshotFn();
				const nextGate = await resolveClientGate(next);
				if (!cancelled) {
					setSnapshot(next);
					setGate(nextGate);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setLoadError(
						error instanceof Error ? error.message : msg.gate_open_failed(),
					);
				}
			}
		}
		void loadSnapshot();
		return () => {
			cancelled = true;
		};
	}, []);

	return { gate, loadError, setGate, snapshot };
}

export function VaultGateShell(props: { children: ReactNode }): ReactNode {
	const { gate, loadError, setGate, snapshot } = useVaultGate();

	if (loadError !== undefined) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<ErrorMessage>{loadError}</ErrorMessage>
			</main>
		);
	}

	if (gate === undefined || snapshot === undefined) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<p className="text-ink/50 m-0">{msg.gate_opening()}</p>
			</main>
		);
	}

	if (gate.kind === "open") {
		return props.children;
	}

	return (
		<VaultGateView
			gate={gate}
			onOpened={(key) => {
				setGate({ key, kind: "open" });
			}}
			snapshot={snapshot}
		/>
	);
}
