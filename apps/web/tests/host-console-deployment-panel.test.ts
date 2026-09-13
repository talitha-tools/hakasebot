import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import type { HostDeploymentStatus } from "#/host-console/domain.ts";
import {
	DEFAULT_APP_WEBHOOK_EVENTS,
	SUBSCRIBE_WEBHOOK_EVENTS,
} from "#/host-console/domain.ts";
import { DeploymentPanel } from "#/host-console/views/deployment-panel.tsx";

function deployment(
	webhook: HostDeploymentStatus["webhook"],
): HostDeploymentStatus {
	return {
		actionRef: "me/fork@v2",
		hostedBot: { kind: "configured", slug: "my-bot" },
		lab: {
			sourceRepoUrl: "https://github.com/me/fork",
			url: "https://lab.example/",
		},
		hostedAppSignIn: { clientIdConfigured: true },
		webhook,
	};
}

const baseWebhook = {
	configured: true,
	lastReceipt: undefined,
	subscribeEvents: SUBSCRIBE_WEBHOOK_EVENTS,
	defaultAppEvents: DEFAULT_APP_WEBHOOK_EVENTS,
	url: "https://lab.example/api/github-webhook",
} as const;

test("webhook checklist stays unticked until github matches", () => {
	const markup = renderToStaticMarkup(
		createElement(DeploymentPanel, {
			deployment: deployment({
				...baseWebhook,
				eventsCheck: { kind: "unchecked" },
				urlCheck: { kind: "unchecked" },
			}),
		}),
	);

	expect(markup).toContain("ticked when they match the helper app on github.");
	expect(markup).toContain("[ ] webhook URL");
	expect(markup).toContain("can&#x27;t check until the helper is set");
	expect(markup).toContain("[ ] subscribed events");
	expect(markup).toContain("can&#x27;t check until the helper is set");
	expect(markup).not.toContain("tick these under Subscribe to events.");
	expect(markup).toContain("[x] app webhook secret");
});

test("webhook checklist ticks url and events when github matches", () => {
	const markup = renderToStaticMarkup(
		createElement(DeploymentPanel, {
			deployment: deployment({
				...baseWebhook,
				eventsCheck: { kind: "match" },
				urlCheck: { kind: "match" },
			}),
		}),
	);

	expect(markup).toContain("[x] webhook URL");
	expect(markup).toContain("matches github");
	expect(markup).toContain("[x] subscribed events");
	expect(markup).toContain("github has these");
	for (const eventName of SUBSCRIBE_WEBHOOK_EVENTS) {
		expect(markup).toContain(`<code>${eventName}</code>`);
	}
	for (const eventName of DEFAULT_APP_WEBHOOK_EVENTS) {
		expect(markup).toContain(`<code>${eventName}</code>`);
	}
});

test("webhook checklist shows github mismatches", () => {
	const markup = renderToStaticMarkup(
		createElement(DeploymentPanel, {
			deployment: deployment({
				...baseWebhook,
				configured: false,
				eventsCheck: {
					kind: "mismatch",
					detail: "issue_comment, pull_request_review_comment",
				},
				urlCheck: {
					kind: "mismatch",
					detail: "https://wrong.example/hook",
				},
			}),
		}),
	);

	expect(markup).toContain("[ ] webhook URL");
	expect(markup).toContain("github has https://wrong.example/hook");
	expect(markup).toContain("[ ] subscribed events");
	expect(markup).toContain(
		"github missing issue_comment, pull_request_review_comment",
	);
	expect(markup).toContain("[ ] app webhook secret");
});
