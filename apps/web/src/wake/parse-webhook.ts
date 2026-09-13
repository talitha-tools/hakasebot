import {
	commitSha,
	githubAppInstallationId,
	githubLogin,
	repoRef,
} from "@hakasebot/core/domain.ts";
import type {
	GithubInstallationId,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { githubRepoRefSchema } from "@hakasebot/core/github-api/json.ts";
import { parseGithubEvent } from "@hakasebot/core/review.server.ts";
import { parseAuthorAssociation } from "@hakasebot/core/wake/domain.ts";
import type {
	WakeEvent,
	WakeIgnoreReason,
} from "@hakasebot/core/wake/domain.ts";
import { keepParsed, parseUnknown } from "@hakasebot/core/zod-parse.ts";
import { z } from "zod";

export type AppLifecycleEvent =
	| { kind: "deleted"; installationId: GithubInstallationId }
	| {
			kind: "repositories-removed";
			installationId: GithubInstallationId;
			repos: RepoRef[];
	  };

const payloadObjectSchema = z.looseObject(
	{},
	{ error: "payload is not an object" },
);

const repositorySchema = z.object(
	{
		default_branch: z.string().optional(),
		id: z.number(),
		name: z.string(),
		owner: z.object({ login: z.string() }),
	},
	{ error: "repository is missing" },
);

const installationSchema = z.object(
	{ id: z.number() },
	{ error: "installation is missing" },
);

const pullUserSchema = z.object({
	id: z.unknown().optional(),
	login: z.string(),
});

const pullBaseRepoSchema = z.object({
	default_branch: z.string().optional(),
});

const pullBaseSchema = z.object({
	ref: z.string().optional(),
	repo: pullBaseRepoSchema.optional(),
});

const pullHeadSchema = z.object({
	sha: z.string().optional(),
});

const pullRequestSchema = z.object({
	author_association: z.unknown().optional(),
	base: pullBaseSchema.optional(),
	draft: z.boolean().optional(),
	head: pullHeadSchema.optional(),
	user: pullUserSchema.optional(),
});

function payloadRecord(
	payload: unknown,
): z.infer<typeof payloadObjectSchema> | undefined {
	const parsed = payloadObjectSchema.safeParse(payload);
	return parsed.success ? parsed.data : undefined;
}

function repoFromPayload(
	payload: Record<string, unknown>,
): ParseResult<WakeEvent["consumer"]> {
	const parsed = parseUnknown(repositorySchema, payload["repository"]);
	if (parsed.kind === "invalid") {
		if (parsed.message === "repository is missing") {
			return parsed;
		}
		return { kind: "invalid", message: "repository id/owner/name is missing" };
	}
	return repoRef({
		id: parsed.value.id,
		name: parsed.value.name,
		owner: parsed.value.owner.login,
	});
}

function installationFromPayload(
	payload: Record<string, unknown>,
): ParseResult<GithubInstallationId> {
	const parsed = parseUnknown(installationSchema, payload["installation"]);
	if (parsed.kind === "invalid") {
		if (parsed.message === "installation is missing") {
			return parsed;
		}
		return { kind: "invalid", message: "installation id is missing" };
	}
	return githubAppInstallationId(String(parsed.value.id));
}

function reposFromLifecyclePayload(
	payload: Record<string, unknown>,
): RepoRef[] {
	const lists = z
		.object({
			repositories: z.array(z.unknown()).optional(),
			repositories_removed: z.array(z.unknown()).optional(),
		})
		.safeParse(payload);
	const raw = lists.success
		? (lists.data.repositories_removed ?? lists.data.repositories ?? [])
		: [];
	const repos = new Map<string, RepoRef>();
	for (const repo of keepParsed(githubRepoRefSchema, raw)) {
		repos.set(repo.id, repo);
	}
	return [...repos.values()];
}

export function parseAppLifecycle(args: {
	eventName: string;
	payload: unknown;
}): ParseResult<AppLifecycleEvent> | undefined {
	const payload = payloadRecord(args.payload);
	if (payload === undefined) {
		return undefined;
	}
	const action = z.string().safeParse(payload["action"]).data;
	if (args.eventName === "installation" && action === "deleted") {
		const installationId = installationFromPayload(payload);
		if (installationId.kind === "invalid") {
			return installationId;
		}
		return {
			kind: "ok",
			value: {
				installationId: installationId.value,
				kind: "deleted",
			},
		};
	}
	if (args.eventName === "installation_repositories" && action === "removed") {
		const installationId = installationFromPayload(payload);
		if (installationId.kind === "invalid") {
			return installationId;
		}
		return {
			kind: "ok",
			value: {
				installationId: installationId.value,
				kind: "repositories-removed",
				repos: reposFromLifecyclePayload(payload),
			},
		};
	}
	return undefined;
}

function authorFromPayload(
	payload: Record<string, unknown>,
): WakeEvent["author"] {
	const pull = pullRequestSchema.safeParse(payload["pull_request"]);
	if (!pull.success || pull.data.user === undefined) {
		return undefined;
	}
	const login = githubLogin(pull.data.user.login);
	if (login.kind === "invalid") {
		return undefined;
	}
	const { id } = pull.data.user;
	return {
		association: parseAuthorAssociation(pull.data.author_association),
		login: login.value,
		userId: typeof id === "number" ? String(id) : undefined,
	};
}

function baseRefFromPayload(
	payload: Record<string, unknown>,
): string | undefined {
	return pullRequestSchema.safeParse(payload["pull_request"]).data?.base?.ref;
}

function defaultBranchFromPayload(
	payload: Record<string, unknown>,
): string | undefined {
	const repoDefault = repositorySchema.safeParse(payload["repository"]).data
		?.default_branch;
	if (repoDefault !== undefined) {
		return repoDefault;
	}
	return pullRequestSchema.safeParse(payload["pull_request"]).data?.base?.repo
		?.default_branch;
}

function headShaFromPayload(
	payload: Record<string, unknown>,
): WakeEvent["headSha"] {
	const sha = pullRequestSchema.safeParse(payload["pull_request"]).data?.head
		?.sha;
	if (sha === undefined) {
		return undefined;
	}
	const parsed = commitSha(sha);
	return parsed.kind === "ok" ? parsed.value : undefined;
}

function commentAction(payload: Record<string, unknown>): string | undefined {
	return z.string().safeParse(payload["action"]).data;
}

function draftFromPayload(
	payload: Record<string, unknown>,
	parsed: WakeEvent["parsed"],
): boolean {
	if (parsed.kind === "pull_request") {
		return parsed.draft;
	}
	return (
		pullRequestSchema.safeParse(payload["pull_request"]).data?.draft === true
	);
}

export function parseWakeEvent(args: {
	eventName: string;
	payload: unknown;
}):
	| { kind: "ok"; value: WakeEvent }
	| { kind: "ignore"; reason: WakeIgnoreReason } {
	const payload = payloadRecord(args.payload);
	if (payload === undefined) {
		return { kind: "ignore", reason: { kind: "unsupported" } };
	}
	if (
		(args.eventName === "issue_comment" ||
			args.eventName === "pull_request_review_comment") &&
		commentAction(payload) !== "created"
	) {
		return { kind: "ignore", reason: { kind: "unsupported" } };
	}
	const decision = parseGithubEvent({
		eventName: args.eventName,
		payload,
	});
	if (decision.kind === "ignore") {
		return { kind: "ignore", reason: { kind: "unsupported" } };
	}
	const consumer = repoFromPayload(payload);
	if (consumer.kind === "invalid") {
		return { kind: "ignore", reason: { kind: "unsupported" } };
	}
	const installationId = installationFromPayload(payload);
	if (installationId.kind === "invalid") {
		return { kind: "ignore", reason: { kind: "unsupported" } };
	}
	return {
		kind: "ok",
		value: {
			author: authorFromPayload(payload),
			baseRef: baseRefFromPayload(payload),
			consumer: consumer.value,
			defaultBranch: defaultBranchFromPayload(payload),
			draft: draftFromPayload(payload, decision.event),
			headSha: headShaFromPayload(payload),
			installationId: installationId.value,
			parsed: decision.event,
		},
	};
}
