import type { LoginPrompt, OauthEngine } from "@hakasebot/core/vendor-login.ts";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { TextAreaField } from "#/components/ui/text-area.tsx";
import { ENGINE_OPTIONS } from "#/lab/constants.ts";
import { m as msg } from "#/paraglide/messages.js";
import { useVendorLogin } from "#/vendor-login/use-vendor-login.ts";
import type { VendorLoginController } from "#/vendor-login/use-vendor-login.ts";

export interface VendorLoginBlockProps {
	engine: OauthEngine;
	onCredential: (plaintext: string) => void;
}

function engineLabel(engine: OauthEngine): string {
	for (const option of ENGINE_OPTIONS) {
		if (option.kind === engine) {
			return option.label;
		}
	}
	return engine;
}

function IdlePrompt(props: {
	engineLabel: string;
	onStart: () => void;
}): ReactNode {
	return (
		<div className="flex flex-col items-start gap-2">
			<Button type="button" variant="ghost" onPress={props.onStart}>
				{msg.vendor_login_button({ engine: props.engineLabel })}
			</Button>
		</div>
	);
}

function BusyPrompt(props: {
	engineLabel: string;
	onCancel: () => void;
}): ReactNode {
	return (
		<div className="flex flex-col items-start gap-2">
			<p className="text-ink/75 m-0 text-sm">
				{msg.vendor_login_checking({ engine: props.engineLabel })}
			</p>
			<Button type="button" variant="quiet" onPress={props.onCancel}>
				{msg.vendor_login_cancel()}
			</Button>
		</div>
	);
}

function DonePrompt(props: { onReset: () => void }): ReactNode {
	return (
		<div className="flex flex-col items-start gap-2">
			<p className="text-ink/75 m-0 text-sm">{msg.vendor_login_done()}</p>
			<Button type="button" variant="quiet" onPress={props.onReset}>
				{msg.vendor_login_again()}
			</Button>
		</div>
	);
}

function FailedPrompt(props: {
	message: string;
	onCancel: () => void;
}): ReactNode {
	return (
		<div className="flex flex-col items-start gap-2">
			<ErrorMessage>{props.message || msg.vendor_login_failed()}</ErrorMessage>
			<Button type="button" variant="ghost" onPress={props.onCancel}>
				{msg.vendor_login_again()}
			</Button>
		</div>
	);
}

function DevicePrompt(props: {
	engineLabel: string;
	onCancel: () => void;
	prompt: LoginPrompt;
}): ReactNode {
	return (
		<div className="flex max-w-[48ch] flex-col items-start gap-2">
			<p className="text-ink/75 m-0 text-sm">
				{msg.vendor_login_waiting({ engine: props.engineLabel })}
			</p>
			<p className="text-ink m-0">
				<a
					className="text-accent-strong underline"
					href={props.prompt.url}
					rel="noreferrer"
					target="_blank"
				>
					{msg.vendor_login_open({ engine: props.engineLabel })}
				</a>
			</p>
			{props.prompt.userCode === undefined ? undefined : (
				<p className="text-ink m-0 font-mono text-sm">
					{msg.vendor_login_device_code({ code: props.prompt.userCode })}
				</p>
			)}
			<Button type="button" variant="quiet" onPress={props.onCancel}>
				{msg.vendor_login_cancel()}
			</Button>
		</div>
	);
}

function CallbackPrompt(props: {
	engineLabel: string;
	login: VendorLoginController;
	prompt: LoginPrompt;
}): ReactNode {
	const [callbackDraft, setCallbackDraft] = useState("");
	return (
		<div className="flex max-w-[48ch] flex-col items-start gap-3">
			<p className="text-ink m-0">
				<a
					className="text-accent-strong underline"
					href={props.prompt.url}
					rel="noreferrer"
					target="_blank"
				>
					{msg.vendor_login_open({ engine: props.engineLabel })}
				</a>
			</p>
			<TextAreaField
				label={msg.vendor_login_callback_label()}
				description={msg.vendor_login_callback_hint()}
				value={callbackDraft}
				onChange={setCallbackDraft}
				rows={3}
				autoComplete="off"
				spellCheck={false}
			/>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					isDisabled={callbackDraft.trim().length === 0}
					onPress={() => {
						props.login.handleSubmitCallback(callbackDraft);
						setCallbackDraft("");
					}}
				>
					{msg.vendor_login_finish()}
				</Button>
				<Button
					type="button"
					variant="quiet"
					onPress={props.login.handleCancel}
				>
					{msg.vendor_login_cancel()}
				</Button>
			</div>
		</div>
	);
}

export function VendorLoginBlock(props: VendorLoginBlockProps): ReactNode {
	const login = useVendorLogin({
		engine: props.engine,
		onCredential: props.onCredential,
	});
	const label = engineLabel(props.engine);
	const { view } = login;

	if (view.kind === "idle") {
		return <IdlePrompt engineLabel={label} onStart={login.handleStart} />;
	}
	if (view.kind === "busy") {
		return <BusyPrompt engineLabel={label} onCancel={login.handleCancel} />;
	}
	if (view.kind === "done") {
		return <DonePrompt onReset={login.handleCancel} />;
	}
	if (view.kind === "failed") {
		return (
			<FailedPrompt message={view.message} onCancel={login.handleCancel} />
		);
	}
	if (view.prompt.next === "poll") {
		return (
			<DevicePrompt
				engineLabel={label}
				onCancel={login.handleCancel}
				prompt={view.prompt}
			/>
		);
	}
	return (
		<CallbackPrompt engineLabel={label} login={login} prompt={view.prompt} />
	);
}
