import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import {
	pullNumber,
	githubAppInstallationId,
	githubLogin,
	commitSha,
	commentId,
} from "#/domain.ts";
import type { Plan } from "#/domain.ts";
import {
	autoWakeAllowsAuthor,
	autoWakeCadenceBlocks,
	autoWakeCadenceMayReplace,
	autoWakeAllowsBranch,
	branchNameMatches,
	decideWake,
	defaultAutoAuthors,
	defaultAutoBranches,
	defaultAutoReviewCadence,
	newDispatchId,
	parseAutoAuthors,
	parseAutoBranches,
	parseSkipLogins,
	wakeKeyFor,
	wakeWouldDispatch,
} from "#/wake/domain.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	PullAuthor,
	WakeDecision,
	WakeKey,
	WakeMode,
	WakeStatus,
} from "#/wake/domain.ts";

function testPull(value: number) {
	return must(pullNumber(value));
}

test("newDispatchId keeps the full entropy of the input bytes", () => {
	const bytes = new Uint8Array(16);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = index;
	}
	const id = newDispatchId(bytes);
	// 16 bytes -> 32 hex chars -> full 128 bits, not truncated to 64.
	expect(id).toHaveLength(bytes.length * 2);
	expect(id).toBe("000102030405060708090a0b0c0d0e0f");
});

function testSha(value: string) {
	return must(commitSha(value));
}

function testComment(value: number) {
	return must(commentId(value));
}

function testLogin(value: string) {
	return must(githubLogin(value));
}

const consumer = testRepoRef("talitha-tools/demo", "900001");
const plan = { kind: "review" as const, pullNumber: testPull(1) };
const everyone = { scope: "everyone" as const, skipLogins: [] };
const owner: PullAuthor = {
	association: "OWNER",
	login: testLogin("thea"),
	userId: "42",
};
const noAccess: PullAuthor = {
	association: "FIRST_TIME_CONTRIBUTOR",
	login: testLogin("stranger"),
	userId: "99",
};

function decide(overrides: {
	alreadyDispatched?: boolean;
	author?: PullAuthor | undefined;
	autoAuthors?: AutoAuthors;
	autoReviewCadence?: AutoReviewCadence;
	autoBranches?: AutoBranches;
	baseRef?: string | undefined;
	defaultBranch?: string | undefined;
	draft?: boolean;
	enabled?: boolean;
	homePresent?: boolean;
	userGithubUserId?: string | undefined;
	plan?: Plan | undefined;
	priorAutoWakeStatus?: WakeStatus;
	wakeKey?: WakeKey;
	wakeMode?: WakeMode;
}): WakeDecision {
	const nextPlan = "plan" in overrides ? overrides.plan : plan;
	const autoReviewCadence =
		overrides.autoReviewCadence ?? defaultAutoReviewCadence();
	const wakeKey =
		overrides.wakeKey ??
		wakeKeyFor({
			autoReviewCadence,
			consumer,
			headSha: undefined,
			plan: nextPlan ?? plan,
		});
	return decideWake({
		alreadyDispatched: overrides.alreadyDispatched ?? false,
		autoAuthorsCheck: {
			author: overrides.author,
			autoAuthors: overrides.autoAuthors ?? everyone,
			userGithubUserId: overrides.userGithubUserId,
		},
		autoReviewCadence,
		autoBranchesCheck: {
			baseRef: overrides.baseRef ?? "main",
			defaultBranch: overrides.defaultBranch ?? "main",
			autoBranches: overrides.autoBranches ?? defaultAutoBranches(),
		},
		draft: overrides.draft ?? false,
		enabled: overrides.enabled ?? true,
		homePresent: overrides.homePresent ?? true,
		plan: nextPlan,
		priorAutoWakeStatus: overrides.priorAutoWakeStatus,
		wakeKey,
		wakeMode: overrides.wakeMode ?? "auto",
	});
}

test("wakeKeyFor uses sha for review and comment id for mention", () => {
	expect(
		wakeKeyFor({
			consumer,
			headSha: testSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
			plan,
		}),
	).toBe("900001#1@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
	expect(
		wakeKeyFor({
			autoReviewCadence: "once-per-pr",
			consumer,
			headSha: testSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
			plan,
		}),
	).toBe("900001#1");
	expect(
		wakeKeyFor({
			consumer,
			headSha: undefined,
			plan: {
				commentId: testComment(99),
				kind: "mention",
				pullNumber: testPull(2),
			},
		}),
	).toBe("900001#2!99");
});

test("decideWake ignores disabled repos, missing home, and missing plans", () => {
	expect(decide({ enabled: false })).toEqual({
		kind: "ignore",
		reason: { kind: "repo-not-enabled" },
	});
	expect(decide({ homePresent: false })).toEqual({
		kind: "ignore",
		reason: { kind: "home-missing" },
	});
	expect(decide({ plan: undefined })).toEqual({
		kind: "ignore",
		reason: { kind: "no-plan" },
	});
});

test("decideWake returns duplicate when the wake key already ran", () => {
	const wakeKey = wakeKeyFor({ consumer, headSha: undefined, plan });
	expect(decide({ alreadyDispatched: true, author: owner, wakeKey })).toEqual({
		kind: "duplicate",
		wakeKey,
	});
});

test("decideWake ignores automatic reviews for draft pull requests", () => {
	expect(decide({ draft: true })).toEqual({
		kind: "ignore",
		reason: { kind: "draft" },
	});
});

test("decideWake dispatches mentions on draft pull requests", () => {
	const mention = {
		commentId: testComment(8),
		kind: "mention" as const,
		pullNumber: testPull(1),
	};
	const wakeKey = wakeKeyFor({
		consumer,
		headSha: undefined,
		plan: mention,
	});
	expect(
		decide({
			draft: true,
			plan: mention,
			wakeKey,
			wakeMode: "mention-only",
		}),
	).toEqual({ kind: "dispatch", plan: mention, wakeKey });
});

test("decideWake dispatches only the User when scope is you", () => {
	const wakeKey = wakeKeyFor({ consumer, headSha: undefined, plan });
	expect(
		decide({
			author: owner,
			autoAuthors: { scope: "you", skipLogins: [] },
			userGithubUserId: "42",
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan, wakeKey });
	expect(
		decide({
			author: noAccess,
			autoAuthors: { scope: "you", skipLogins: [] },
			userGithubUserId: "42",
		}),
	).toEqual({ kind: "ignore", reason: { kind: "auto-authors" } });
});

test("decideWake default you ignores auto reviews that are not the User", () => {
	expect(decide({ autoAuthors: defaultAutoAuthors() })).toEqual({
		kind: "ignore",
		reason: { kind: "auto-authors" },
	});
});

test("decideWake ignores automatic reviews in mention-only mode", () => {
	expect(decide({ wakeMode: "mention-only" })).toEqual({
		kind: "ignore",
		reason: { kind: "mention-only" },
	});
});

test("decideWake dispatches opened pull requests in auto mode", () => {
	const wakeKey = wakeKeyFor({ consumer, headSha: undefined, plan });
	expect(decide({ author: owner, wakeKey })).toEqual({
		kind: "dispatch",
		plan,
		wakeKey,
	});
});

test("decideWake ignores a first-time contributor when scope is friends", () => {
	expect(
		decide({
			author: noAccess,
			autoAuthors: { scope: "friends", skipLogins: [] },
		}),
	).toEqual({ kind: "ignore", reason: { kind: "auto-authors" } });
});

test("decideWake dispatches friends auto reviews when scope is friends", () => {
	const wakeKey = wakeKeyFor({ consumer, headSha: undefined, plan });
	expect(
		decide({
			author: owner,
			autoAuthors: { scope: "friends", skipLogins: [] },
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan, wakeKey });
});

test("decideWake dispatches MEMBER auto reviews when scope is friends", () => {
	const wakeKey = wakeKeyFor({ consumer, headSha: undefined, plan });
	expect(
		decide({
			author: { ...owner, association: "MEMBER" },
			autoAuthors: { scope: "friends", skipLogins: [] },
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan, wakeKey });
});

test("decideWake dispatches COLLABORATOR auto reviews when scope is friends", () => {
	const wakeKey = wakeKeyFor({ consumer, headSha: undefined, plan });
	expect(
		decide({
			author: { ...owner, association: "COLLABORATOR" },
			autoAuthors: { scope: "friends", skipLogins: [] },
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan, wakeKey });
});

test("decideWake ignores CONTRIBUTOR auto reviews when scope is friends", () => {
	expect(
		decide({
			author: { ...owner, association: "CONTRIBUTOR" },
			autoAuthors: { scope: "friends", skipLogins: [] },
		}),
	).toEqual({ kind: "ignore", reason: { kind: "auto-authors" } });
});

test("decideWake ignores skipped logins even when scope is everyone", () => {
	expect(
		decide({
			author: owner,
			autoAuthors: { scope: "everyone", skipLogins: [owner.login] },
		}),
	).toEqual({ kind: "ignore", reason: { kind: "auto-authors" } });
});

test("decideWake still mentions a skipped author", () => {
	const mention = {
		commentId: testComment(8),
		kind: "mention" as const,
		pullNumber: testPull(1),
	};
	const wakeKey = wakeKeyFor({
		consumer,
		headSha: undefined,
		plan: mention,
	});
	expect(
		decide({
			author: owner,
			autoAuthors: { scope: "everyone", skipLogins: [owner.login] },
			plan: mention,
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan: mention, wakeKey });
});

test("decideWake still runs a fix phrase for a skipped author", () => {
	const fix = {
		commentId: testComment(9),
		kind: "fix" as const,
		pullNumber: testPull(1),
	};
	const wakeKey = wakeKeyFor({
		consumer,
		headSha: undefined,
		plan: fix,
	});
	expect(
		decide({
			author: owner,
			autoAuthors: { scope: "friends", skipLogins: [owner.login] },
			plan: fix,
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan: fix, wakeKey });
});

test("autoWakeAllowsAuthor denies a missing author for every scope", () => {
	expect(
		autoWakeAllowsAuthor({
			author: undefined,
			userGithubUserId: "42",
			autoAuthors: { scope: "everyone", skipLogins: [] },
		}),
	).toBe(false);
	expect(
		autoWakeAllowsAuthor({
			author: undefined,
			userGithubUserId: "42",
			autoAuthors: { scope: "friends", skipLogins: [] },
		}),
	).toBe(false);
	expect(
		autoWakeAllowsAuthor({
			author: undefined,
			userGithubUserId: "42",
			autoAuthors: { scope: "you", skipLogins: [] },
		}),
	).toBe(false);
});

test("autoWakeAllowsAuthor you matches the User github user id", () => {
	expect(
		autoWakeAllowsAuthor({
			author: owner,
			userGithubUserId: "42",
			autoAuthors: { scope: "you", skipLogins: [] },
		}),
	).toBe(true);
	expect(
		autoWakeAllowsAuthor({
			author: noAccess,
			userGithubUserId: "42",
			autoAuthors: { scope: "you", skipLogins: [] },
		}),
	).toBe(false);
	expect(
		autoWakeAllowsAuthor({
			author: { ...owner, userId: undefined },
			userGithubUserId: "42",
			autoAuthors: { scope: "you", skipLogins: [] },
		}),
	).toBe(false);
});

test("parseSkipLogins strips at-signs, lowercases, and dedupes", () => {
	expect(parseSkipLogins(["@Thea", "thea", "Bob"])).toEqual({
		kind: "ok",
		value: ["thea", "bob"],
	});
	expect(parseSkipLogins(["nope!!"])).toEqual({
		kind: "invalid",
		message: "github login is invalid",
	});
});

test("parseAutoAuthors rejects unknown scopes", () => {
	expect(parseAutoAuthors({ scope: "bots", skipLogins: [] })).toEqual({
		kind: "invalid",
		message: "auto authors is invalid",
	});
	expect(
		parseAutoAuthors({ scope: "friends", skipLogins: ["ok"] }),
	).toMatchObject({
		kind: "ok",
		value: { scope: "friends", skipLogins: ["ok"] },
	});
});

test("defaultAutoAuthors is only you", () => {
	expect(defaultAutoAuthors()).toEqual({ scope: "you", skipLogins: [] });
});

test("defaultAutoReviewCadence is every push", () => {
	expect(defaultAutoReviewCadence()).toBe("every-push");
});

test("autoWakeCadenceBlocks only once-per-pr with queued or dispatched", () => {
	expect(
		autoWakeCadenceBlocks({
			cadence: "every-push",
			priorStatus: "dispatched",
		}),
	).toBe(false);
	expect(
		autoWakeCadenceBlocks({
			cadence: "once-per-pr",
			priorStatus: "dispatched",
		}),
	).toBe(true);
	expect(
		autoWakeCadenceBlocks({
			cadence: "once-per-pr",
			priorStatus: "cancelled",
		}),
	).toBe(false);
	expect(
		autoWakeCadenceBlocks({
			cadence: "once-per-pr",
			priorStatus: "failed",
		}),
	).toBe(false);
	expect(
		autoWakeCadenceBlocks({
			cadence: "once-per-pr",
			priorStatus: "superseded",
		}),
	).toBe(false);
});

test("autoWakeCadenceMayReplace allows once-per-pr retry after superseded", () => {
	expect(
		autoWakeCadenceMayReplace({
			cadence: "once-per-pr",
			priorStatus: "superseded",
		}),
	).toBe(true);
});

test("decideWake skips once-per-pr when a prior auto wake is still active", () => {
	const wakeKey = wakeKeyFor({
		autoReviewCadence: "once-per-pr",
		consumer,
		headSha: undefined,
		plan,
	});
	expect(
		decide({
			autoReviewCadence: "once-per-pr",
			author: owner,
			priorAutoWakeStatus: "dispatched",
			wakeKey,
		}),
	).toEqual({ kind: "duplicate", wakeKey });
	expect(
		decide({
			autoReviewCadence: "once-per-pr",
			author: owner,
			priorAutoWakeStatus: "cancelled",
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan, wakeKey });
	expect(
		decide({
			autoReviewCadence: "once-per-pr",
			author: owner,
			priorAutoWakeStatus: "failed",
			wakeKey,
		}),
	).toEqual({ kind: "dispatch", plan, wakeKey });
});

test("parseAutoAuthors aliases stored anyone team outsiders rows", () => {
	expect(parseAutoAuthors({ scope: "anyone", skipLogins: [] })).toMatchObject({
		kind: "ok",
		value: { scope: "you" },
	});
	expect(parseAutoAuthors({ scope: "team", skipLogins: [] })).toMatchObject({
		kind: "ok",
		value: { scope: "friends" },
	});
	expect(
		parseAutoAuthors({ scope: "outsiders", skipLogins: [] }),
	).toMatchObject({
		kind: "ok",
		value: { scope: "everyone" },
	});
});

test("wakeWouldDispatch requires an enabled route with a home repo", () => {
	const home = {
		installationId: must(githubAppInstallationId("2")),
		repo: consumer,
	};
	expect(wakeWouldDispatch({ enabled: true, home })).toBe(true);
	expect(wakeWouldDispatch({ enabled: false, home })).toBe(false);
	expect(wakeWouldDispatch({ enabled: true, home: undefined })).toBe(false);
});

test("branchNameMatches supports globs", () => {
	expect(branchNameMatches("main", "main")).toBe(true);
	expect(branchNameMatches("release/*", "release/1.2")).toBe(true);
	expect(branchNameMatches("release/*", "main")).toBe(false);
});

test("autoWakeAllowsBranch skips listed skip branches", () => {
	expect(
		autoWakeAllowsBranch({
			baseRef: "staging",
			defaultBranch: "main",
			autoBranches: {
				scope: "all",
				branches: [],
				skipBranches: ["staging"],
			},
		}),
	).toBe(false);
});

test("decideWake ignores auto reviews outside auto branch scope", () => {
	expect(
		decide({
			author: owner,
			autoBranches: { scope: "default", branches: [], skipBranches: [] },
			baseRef: "develop",
			defaultBranch: "main",
		}),
	).toEqual({
		kind: "ignore",
		reason: { kind: "auto-branches" },
	});
});

test("decideWake dispatches listed auto reviews when base matches", () => {
	expect(
		decide({
			author: owner,
			autoBranches: {
				scope: "listed",
				branches: ["release/*"],
				skipBranches: [],
			},
			baseRef: "release/2.0",
			defaultBranch: "main",
		}),
	).toEqual({
		kind: "dispatch",
		plan,
		wakeKey: wakeKeyFor({ consumer, headSha: undefined, plan }),
	});
});

test("defaultAutoBranches is default branch only", () => {
	expect(defaultAutoBranches()).toEqual({
		scope: "default",
		branches: [],
		skipBranches: [],
	});
});

test("parseAutoBranches rejects unknown scopes", () => {
	expect(parseAutoBranches({ scope: "main", branches: [] })).toEqual({
		kind: "invalid",
		message: "auto branches is invalid",
	});
});
