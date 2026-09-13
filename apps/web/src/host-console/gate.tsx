import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { TextAreaField } from "#/components/ui/text-area.tsx";
import { m as msg } from "#/paraglide/messages.js";

import { loadHostConsoleToken, saveHostConsoleToken } from "./session-token.ts";
import { HostConsoleShell } from "./shell.tsx";
import { fetchHostSnapshot } from "./snapshot-rpc.ts";

function useTokenForm(onUnlock: (token: string) => Promise<void>) {
	const [raw, setRaw] = useState("");
	const [busy, setBusy] = useState(false);
	const [formError, setFormError] = useState<string | undefined>(undefined);

	async function submit() {
		if (busy) {
			return;
		}
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			setFormError(msg.host_token_empty());
			return;
		}
		setBusy(true);
		setFormError(undefined);
		try {
			await onUnlock(trimmed);
		} catch (error: unknown) {
			setFormError(errorMessage(error, msg.host_token_wrong()));
		}
		setBusy(false);
	}

	return { busy, formError, raw, setRaw, submit };
}

function HostConsoleTokenGate(props: {
	onUnlock: (token: string) => Promise<void>;
}): ReactNode {
	const { busy, formError, raw, setRaw, submit } = useTokenForm(props.onUnlock);

	return (
		<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
			<Label>{msg.host_back_room()}</Label>
			<h1 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.host_back_room()}
			</h1>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.host_token_intro_before()}{" "}
				<code className="text-ink">HOST_CONSOLE_TOKEN</code>{" "}
				{msg.host_token_intro_after()}
			</p>
			<div className="border-ink mt-6 border-2 px-4 py-4">
				<form
					className="flex flex-col items-start gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<TextAreaField
						label={msg.host_token_label()}
						value={raw}
						onChange={setRaw}
						rows={3}
						autoComplete="off"
						spellCheck={false}
					/>
					{formError === undefined ? undefined : (
						<ErrorMessage>{formError}</ErrorMessage>
					)}
					<Button isDisabled={busy || raw.trim().length === 0} type="submit">
						{busy ? msg.host_checking() : msg.host_unlock()}
					</Button>
				</form>
			</div>
		</main>
	);
}

function useHostConsoleSession() {
	const [token, setToken] = useState<string | undefined>(undefined);
	const [loadError, setLoadError] = useState<string | undefined>(undefined);

	const unlock = useCallback(async (nextToken: string) => {
		try {
			await fetchHostSnapshot(nextToken);
			saveHostConsoleToken(nextToken);
			setToken(nextToken);
		} catch (error: unknown) {
			setLoadError(errorMessage(error, msg.host_flopped()));
		}
	}, []);

	useEffect(() => {
		const stored = loadHostConsoleToken();
		if (stored === undefined) {
			return;
		}
		let cancelled = false;
		const storedToken = stored;
		async function restoreSession() {
			try {
				await fetchHostSnapshot(storedToken);
				if (!cancelled) {
					setToken(storedToken);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setLoadError(errorMessage(error, msg.host_flopped()));
				}
			}
		}
		void restoreSession();
		return () => {
			cancelled = true;
		};
	}, []);

	return { loadError, token, unlock };
}

export function HostConsoleGate(): ReactNode {
	const { loadError, token, unlock } = useHostConsoleSession();

	if (token !== undefined) {
		return <HostConsoleShell token={token} />;
	}

	if (loadError !== undefined) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<ErrorMessage>{loadError}</ErrorMessage>
			</main>
		);
	}

	if (loadHostConsoleToken() !== undefined) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<p className="text-ink/50 m-0">{msg.host_peeking()}</p>
			</main>
		);
	}

	return <HostConsoleTokenGate onUnlock={unlock} />;
}
