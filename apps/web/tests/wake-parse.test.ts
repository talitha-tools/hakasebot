import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { parseAppLifecycle, parseWakeEvent } from "#/wake/parse-webhook.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");

function repositoryPayload() {
	return {
		id: Number(consumer.id),
		name: consumer.name,
		owner: { login: consumer.owner },
	};
}

test("parseWakeEvent maps a draft pull_request payload", () => {
	const parsed = parseWakeEvent({
		eventName: "pull_request",
		payload: {
			action: "opened",
			installation: { id: 7 },
			pull_request: {
				draft: true,
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 3,
			},
			repository: repositoryPayload(),
			sender: { type: "User" },
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.consumer).toEqual(consumer);
	expect(parsed.value.draft).toBe(true);
	expect(parsed.value.author).toBeUndefined();
	expect(parsed.value.parsed).toEqual({
		draft: true,
		kind: "pull_request",
		pullNumber: 3,
	});
});

test("parseWakeEvent treats ready_for_review as non-draft", () => {
	const parsed = parseWakeEvent({
		eventName: "pull_request",
		payload: {
			action: "ready_for_review",
			installation: { id: 7 },
			pull_request: {
				draft: true,
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 3,
			},
			repository: repositoryPayload(),
			sender: { type: "User" },
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.draft).toBe(false);
	expect(parsed.value.parsed).toEqual({
		draft: false,
		kind: "pull_request",
		pullNumber: 3,
	});
});

test("parseWakeEvent ignores comment edits", () => {
	expect(
		parseWakeEvent({
			eventName: "issue_comment",
			payload: {
				action: "edited",
				comment: { body: "please review", id: 1 },
				installation: { id: 7 },
				issue: { number: 3, pull_request: {} },
				repository: repositoryPayload(),
				sender: { type: "User" },
			},
		}),
	).toEqual({ kind: "ignore", reason: { kind: "unsupported" } });
});

test("parseAppLifecycle maps an installation deletion", () => {
	expect(
		parseAppLifecycle({
			eventName: "installation",
			payload: {
				action: "deleted",
				installation: { id: 7 },
			},
		}),
	).toEqual({
		kind: "ok",
		value: { installationId: "7", kind: "deleted" },
	});
});

test("parseAppLifecycle maps removed repositories defensively", () => {
	const demo = testRepoRef("talitha-tools/demo", "900001");
	const other = testRepoRef("talitha-tools/other", "900002");
	expect(
		parseAppLifecycle({
			eventName: "installation_repositories",
			payload: {
				action: "removed",
				installation: { id: 7 },
				repositories: [
					{
						full_name: "talitha-tools/demo",
						id: Number(demo.id),
						name: "demo",
					},
					{
						full_name: "talitha-tools/other",
						id: Number(other.id),
						name: "other",
					},
					{ name: "missing-owner" },
					undefined,
				],
			},
		}),
	).toEqual({
		kind: "ok",
		value: {
			installationId: "7",
			kind: "repositories-removed",
			repos: [demo, other],
		},
	});
});

test("parseAppLifecycle rejects a lifecycle event with a bad installation id", () => {
	expect(
		parseAppLifecycle({
			eventName: "installation",
			payload: {
				action: "deleted",
				installation: { id: "bad" },
			},
		}),
	).toEqual({ kind: "invalid", message: "installation id is missing" });
});

test("parseWakeEvent maps pull request author and association", () => {
	const parsed = parseWakeEvent({
		eventName: "pull_request",
		payload: {
			action: "opened",
			installation: { id: 7 },
			pull_request: {
				author_association: "FIRST_TIME_CONTRIBUTOR",
				draft: false,
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 3,
				user: { id: 99, login: "@Stranger" },
			},
			repository: repositoryPayload(),
			sender: { type: "User" },
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.author).toEqual({
		association: "FIRST_TIME_CONTRIBUTOR",
		login: "stranger",
		userId: "99",
	});
});

test("parseWakeEvent maps pull request base ref and default branch", () => {
	const parsed = parseWakeEvent({
		eventName: "pull_request",
		payload: {
			action: "opened",
			installation: { id: 7 },
			pull_request: {
				base: {
					ref: "release-1",
					repo: { default_branch: "main" },
				},
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 3,
			},
			repository: repositoryPayload(),
			sender: { type: "User" },
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.baseRef).toBe("release-1");
	expect(parsed.value.defaultBranch).toBe("main");
});

test("parseWakeEvent reads default branch from base repo when repository omits it", () => {
	const parsed = parseWakeEvent({
		eventName: "pull_request",
		payload: {
			action: "opened",
			installation: { id: 7 },
			pull_request: {
				base: {
					ref: "main",
					repo: { default_branch: "develop" },
				},
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 3,
			},
			repository: repositoryPayload(),
			sender: { type: "User" },
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.defaultBranch).toBe("develop");
});

test("parseWakeEvent ignores a bot sender after author parsing", () => {
	expect(
		parseWakeEvent({
			eventName: "pull_request",
			payload: {
				action: "opened",
				installation: { id: 7 },
				pull_request: {
					author_association: "OWNER",
					draft: false,
					head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
					number: 3,
					user: { id: 1, login: "thea" },
				},
				repository: repositoryPayload(),
				sender: { type: "Bot" },
			},
		}),
	).toEqual({ kind: "ignore", reason: { kind: "unsupported" } });
});
