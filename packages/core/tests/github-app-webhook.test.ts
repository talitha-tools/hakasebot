import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { afterEach, expect, test } from "vitest";

import { githubAppId } from "#/domain.ts";
import { fetchGithubAppWebhookSettings } from "#/github-api.server.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

test("fetchGithubAppWebhookSettings reads hook url and events", async () => {
	restoreFetch = installGithubFetchMock({
		getApp: () => ({
			json: {
				events: ["pull_request", "issue_comment"],
			},
		}),
		getAppHookConfig: () => ({
			json: { url: "https://lab.example/api/github-webhook" },
		}),
	});

	const result = await fetchGithubAppWebhookSettings({
		appId: must(githubAppId("1")),
		privateKey: TEST_APP_PRIVATE_KEY,
	});

	expect(result).toEqual({
		events: { kind: "ok", value: ["pull_request", "issue_comment"] },
		url: { kind: "ok", value: "https://lab.example/api/github-webhook" },
	});
});

test("fetchGithubAppWebhookSettings keeps events when hook url is missing", async () => {
	restoreFetch = installGithubFetchMock({
		getApp: () => ({ json: { events: ["pull_request"] } }),
		getAppHookConfig: () => ({ json: {} }),
	});

	const result = await fetchGithubAppWebhookSettings({
		appId: must(githubAppId("1")),
		privateKey: TEST_APP_PRIVATE_KEY,
	});

	expect(result).toEqual({
		events: { kind: "ok", value: ["pull_request"] },
		url: { kind: "invalid", message: "github app hook config missing url" },
	});
});

test("fetchGithubAppWebhookSettings keeps url when app events fail", async () => {
	restoreFetch = installGithubFetchMock({
		getApp: () => ({ status: 404, json: { message: "Not Found" } }),
		getAppHookConfig: () => ({
			json: { url: "https://lab.example/api/github-webhook" },
		}),
	});

	const result = await fetchGithubAppWebhookSettings({
		appId: must(githubAppId("1")),
		privateKey: TEST_APP_PRIVATE_KEY,
	});

	expect(result).toEqual({
		events: { kind: "invalid", message: "Not Found" },
		url: { kind: "ok", value: "https://lab.example/api/github-webhook" },
	});
});
