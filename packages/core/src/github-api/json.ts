import { z } from "zod";

import {
	commentId,
	githubAppInstallationId,
	githubAppSlug,
	repoRefFromApi,
	reviewId,
} from "#/domain.ts";
import type {
	CommentId,
	GithubAppSlug,
	GithubInstallationId,
	ParseResult,
	RepoRef,
	ReviewId,
} from "#/domain.ts";
import {
	firstParsed,
	fromParseResult,
	keepParsed,
	parseArrayField,
	parseUnknownArray,
} from "#/zod-parse.ts";

const githubRepoApiObjectSchema = z.object({
	full_name: z.string(),
	id: z.number(),
});

export const githubRepoRefSchema: z.ZodType<RepoRef> = fromParseResult(
	githubRepoApiObjectSchema,
	repoRefFromApi,
);

export function reposFromGithubList(items: readonly unknown[]): RepoRef[] {
	return keepParsed(githubRepoRefSchema, items);
}

function githubRepoListPage(items: readonly unknown[]): {
	pageLength: number;
	repos: RepoRef[];
} {
	return {
		pageLength: items.length,
		repos: reposFromGithubList(items),
	};
}

export function parseGithubRepoList(
	json: unknown,
	notArrayMessage: string,
): ParseResult<{ pageLength: number; repos: RepoRef[] }> {
	const listed = parseUnknownArray(json, notArrayMessage);
	if (listed.kind === "invalid") {
		return listed;
	}
	return { kind: "ok", value: githubRepoListPage(listed.value) };
}

export function parseGithubRepoListField(
	json: unknown,
	field: string,
	message: string,
): ParseResult<{ pageLength: number; repos: RepoRef[] }> {
	const listed = parseArrayField(json, [field], message);
	if (listed.kind === "invalid") {
		return listed;
	}
	return { kind: "ok", value: githubRepoListPage(listed.value) };
}

const accountLoginSchema = z
	.object({ login: z.string() })
	.transform((account) => {
		const login = account.login.trim();
		return login === "" ? undefined : login;
	});

export interface UserAppInstallation {
	accountLogin: string | undefined;
	id: GithubInstallationId;
}

const userInstallationItemSchema = z
	.object({
		account: z.unknown().optional(),
		app_slug: z.string(),
		id: z.number(),
	})
	.transform((item, ctx) => {
		const parsed = githubAppInstallationId(String(item.id));
		if (parsed.kind === "invalid") {
			ctx.addIssue({ code: "custom", message: parsed.message });
			return z.NEVER;
		}
		const slug = githubAppSlug(item.app_slug);
		if (slug.kind === "invalid") {
			ctx.addIssue({ code: "custom", message: slug.message });
			return z.NEVER;
		}
		const account = accountLoginSchema.safeParse(item.account);
		return {
			accountLogin: account.success ? account.data : undefined,
			appSlug: slug.value,
			id: parsed.value,
		};
	});

export function installationsForApp(args: {
	appSlug: GithubAppSlug;
	json: unknown;
}): ParseResult<UserAppInstallation[]> {
	const listed = parseArrayField(
		args.json,
		["installations"],
		"user installations response is missing installations",
	);
	if (listed.kind === "invalid") {
		return listed;
	}
	return {
		kind: "ok",
		value: keepParsed(userInstallationItemSchema, listed.value).flatMap(
			(installation) =>
				installation.appSlug === args.appSlug
					? [
							{
								accountLogin: installation.accountLogin,
								id: installation.id,
							},
						]
					: [],
		),
	};
}

const numberedIdObjectSchema = z.object({ id: z.number() });

export const githubCommentIdSchema: z.ZodType<CommentId> = fromParseResult(
	numberedIdObjectSchema.transform((row) => row.id),
	commentId,
);

export const githubReviewIdSchema: z.ZodType<ReviewId> = fromParseResult(
	numberedIdObjectSchema.transform((row) => row.id),
	reviewId,
);

export const githubLoginSchema = z.object(
	{ login: z.string({ error: "github login is missing" }) },
	{ error: "github login is missing" },
);

export const githubNonEmptyLoginSchema = z.object(
	{
		login: z
			.string({ error: "github login is missing" })
			.trim()
			.min(1, { error: "github login is missing" }),
	},
	{ error: "github login is missing" },
);

export const githubCommentBodySchema = z.object({ body: z.string() });

const issueCommentItemSchema = z.object({
	body: z.string(),
	id: fromParseResult(z.number(), commentId),
});

export function commentsFromGithubList(
	items: readonly unknown[],
): { body: string; id: CommentId }[] {
	return keepParsed(issueCommentItemSchema, items);
}

export interface PullFile {
	filename: string;
	status: string;
	patch?: string;
}

const pullFileObjectSchema = z.object({
	filename: z.string(),
	patch: z.unknown().optional(),
	status: z.unknown().optional(),
});

export const pullFileSchema: z.ZodType<PullFile> =
	pullFileObjectSchema.transform((item) => {
		const status = firstParsed(z.string(), [item.status]) ?? "modified";
		const patch = firstParsed(z.string(), [item.patch]);
		return {
			filename: item.filename,
			status,
			...(patch === undefined ? {} : { patch }),
		};
	});

export interface GithubReviewListItem {
	id: ReviewId;
	body: string;
	commitId: string;
	state: string;
	submittedAt: number;
}

const pullReviewObjectSchema = z.object({
	body: z.string(),
	commit_id: z.string(),
	id: z.number(),
	state: z.string(),
	submitted_at: z.string(),
});

export const pullReviewItemSchema: z.ZodType<GithubReviewListItem> =
	pullReviewObjectSchema.transform((item, ctx) => {
		const submittedAt = Date.parse(item.submitted_at);
		if (Number.isNaN(submittedAt)) {
			ctx.addIssue({
				code: "custom",
				message: "review submitted_at is invalid",
			});
			return z.NEVER;
		}
		const id = reviewId(item.id);
		if (id.kind === "invalid") {
			ctx.addIssue({ code: "custom", message: id.message });
			return z.NEVER;
		}
		return {
			body: item.body,
			commitId: item.commit_id,
			id: id.value,
			state: item.state,
			submittedAt,
		};
	});

export const pullHtmlUrlSchema = z.object({ html_url: z.string() });

const pullHeadObjectSchema = z.object(
	{ sha: z.string({ error: "pull response missing head sha" }) },
	{ error: "pull response missing head sha" },
);

export const pullHeadShaSchema = z.object(
	{ head: pullHeadObjectSchema },
	{ error: "pull response missing head sha" },
);

export const workflowRunItemSchema = z.object({
	created_at: z.unknown().optional(),
	display_title: z.unknown().optional(),
	html_url: z.string(),
	name: z.unknown().optional(),
});
