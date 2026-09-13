import type { ReactNode } from "react";

import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import type {
	HostDeploymentStatus,
	WebhookSettingCheck,
} from "#/host-console/domain.ts";
import { webhookSettingTicked } from "#/host-console/domain.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { WebhookReceipt } from "#/wake/webhook-receipt.ts";

function StatusRow(props: { children: ReactNode; label: string }): ReactNode {
	return (
		<div className="border-ink/20 flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between">
			<span className="text-ink/60 text-sm font-bold">{props.label}</span>
			<span className="text-ink break-all">{props.children}</span>
		</div>
	);
}

function ExternalLink(props: { href: string }): ReactNode {
	return (
		<a
			className="text-accent-strong underline"
			href={props.href}
			rel="noreferrer"
			target="_blank"
		>
			{props.href}
		</a>
	);
}

function LastReceipt(props: {
	receipt: WebhookReceipt | undefined;
}): ReactNode {
	if (props.receipt === undefined) {
		return <p className="text-ink/60 mt-1 mb-0">{msg.host_receipt_none()}</p>;
	}
	const receivedAtIso = new Date(props.receipt.receivedAt).toISOString();
	return (
		<dl className="mt-2 mb-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
			<dt className="text-ink/60 font-bold">{msg.host_receipt_time()}</dt>
			<dd className="m-0 break-all">
				<time dateTime={receivedAtIso}>{receivedAtIso}</time>
			</dd>
			<dt className="text-ink/60 font-bold">{msg.host_receipt_event()}</dt>
			<dd className="m-0">
				<code>{props.receipt.eventName}</code>
			</dd>
			<dt className="text-ink/60 font-bold">{msg.host_receipt_outcome()}</dt>
			<dd className="m-0">
				<code>{props.receipt.outcome}</code>
			</dd>
		</dl>
	);
}

function EventList(props: { events: readonly string[] }): ReactNode {
	return (
		<ul className="mt-1 mb-0 list-[square] pl-10">
			{props.events.map((eventName) => (
				<li key={eventName}>
					<code>{eventName}</code>
				</li>
			))}
		</ul>
	);
}

function checklistTitle(ticked: boolean, label: string): string {
	return ticked
		? msg.host_checklist_ticked({ label })
		: msg.host_checklist_unticked({ label });
}

function webhookCheckNote(
	check: WebhookSettingCheck,
	notes: {
		match: string;
		mismatch: (detail: string) => string;
		unchecked: string;
	},
): string {
	switch (check.kind) {
		case "match": {
			return notes.match;
		}
		case "mismatch": {
			return notes.mismatch(check.detail);
		}
		case "error": {
			return check.message;
		}
		case "unchecked": {
			return notes.unchecked;
		}
	}
}

function ChecklistStep(props: {
	children?: ReactNode;
	note?: string;
	title: string;
}): ReactNode {
	return (
		<li>
			<p className="m-0 font-bold">{props.title}</p>
			{props.note === undefined ? undefined : (
				<p className="text-ink/70 mt-1 mb-0 pl-5 text-sm">{props.note}</p>
			)}
			{props.children}
		</li>
	);
}

function WebhookChecklistItems(props: {
	webhook: HostDeploymentStatus["webhook"];
}): ReactNode {
	const { webhook } = props;
	return (
		<ol className="m-0 flex list-none flex-col gap-4 p-0">
			<ChecklistStep
				note={webhookCheckNote(webhook.urlCheck, {
					match: msg.host_webhook_url_match(),
					mismatch: (detail) => msg.host_webhook_url_mismatch({ detail }),
					unchecked: msg.host_webhook_unchecked(),
				})}
				title={checklistTitle(
					webhookSettingTicked(webhook.urlCheck),
					msg.host_webhook_url(),
				)}
			>
				<div className="mt-1 pl-5">
					<ExternalLink href={webhook.url} />
				</div>
			</ChecklistStep>
			<ChecklistStep
				note={webhookCheckNote(webhook.eventsCheck, {
					match: msg.host_webhook_events_match(),
					mismatch: (detail) => msg.host_webhook_events_mismatch({ detail }),
					unchecked: msg.host_webhook_unchecked(),
				})}
				title={checklistTitle(
					webhookSettingTicked(webhook.eventsCheck),
					msg.host_webhook_events(),
				)}
			>
				<EventList events={webhook.subscribeEvents} />
			</ChecklistStep>
			<ChecklistStep
				note={msg.host_webhook_default_note()}
				title={msg.host_webhook_default_events()}
			>
				<EventList events={webhook.defaultAppEvents} />
			</ChecklistStep>
			<ChecklistStep
				note={webhook.configured ? msg.host_configured() : msg.host_unset()}
				title={checklistTitle(webhook.configured, msg.host_webhook_secret())}
			/>
		</ol>
	);
}

function WebhookChecklist(props: {
	webhook: HostDeploymentStatus["webhook"];
}): ReactNode {
	const { webhook } = props;
	return (
		<div className="border-ink bg-blush/30 mt-5 border-2 border-dashed p-4">
			<p className="text-accent-strong m-0 text-xl font-bold">
				{msg.host_webhook_heading()}
			</p>
			<p className="text-ink/70 mt-1 mb-4 text-sm">
				{msg.host_webhook_intro()}
			</p>
			<WebhookChecklistItems webhook={webhook} />
			<div className="border-ink/30 mt-5 border-t pt-3">
				<p className="m-0 font-bold">{msg.host_webhook_last()}</p>
				<LastReceipt receipt={webhook.lastReceipt} />
			</div>
		</div>
	);
}

export function DeploymentPanel(props: {
	deployment: HostDeploymentStatus;
}): ReactNode {
	const { deployment } = props;
	const hostedBot =
		deployment.hostedBot.kind === "configured"
			? deployment.hostedBot.slug
			: msg.host_unset();

	return (
		<Section>
			<Label>{msg.host_deployment_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				hakasebot
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.host_deployment_intro()}
			</p>
			<div className="border-ink mt-6 border-2 px-4 py-2">
				<StatusRow label={msg.host_lab_url()}>
					<ExternalLink href={deployment.lab.url} />
				</StatusRow>
				<StatusRow label={msg.host_source_repo()}>
					<ExternalLink href={deployment.lab.sourceRepoUrl} />
				</StatusRow>
				<StatusRow label={msg.host_action_ref()}>
					{deployment.actionRef}
				</StatusRow>
				<StatusRow label={msg.host_bot_slug()}>{hostedBot}</StatusRow>
				<StatusRow label={msg.host_app_signin()}>
					{deployment.hostedAppSignIn.clientIdConfigured
						? msg.host_configured()
						: msg.host_unset()}
				</StatusRow>
			</div>
			<WebhookChecklist webhook={deployment.webhook} />
		</Section>
	);
}
