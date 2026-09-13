import type {
	CommentId,
	CommitSha,
	GithubInstallationId,
	ParseResult,
	Plan,
	PullNumber,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import {
	commentId,
	commitSha,
	githubAppInstallationId,
	parseRepoRef,
	pullNumber,
	repoId,
	repoRefFromParts,
} from "@hakasebot/core/domain.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import type { DispatchId } from "@hakasebot/core/wake/domain.ts";

export interface HomeRunInputs {
	commentId: CommentId | undefined;
	consumer: RepoRef;
	dispatchId: DispatchId;
	headSha: CommitSha | undefined;
	installationId: GithubInstallationId;
	plan: Plan;
	progressCommentId: CommentId | undefined;
	pullNumber: PullNumber;
	routeGeneration: number | undefined;
}

type Env = Record<string, string | undefined>;

function actionInput(env: Env, name: string): string | undefined {
	const value = env[`INPUT_${name.toUpperCase()}`];
	if (value === undefined || value.length === 0) {
		return undefined;
	}
	return value;
}

function requiredInput<T>(args: {
	env: Env;
	name: string;
	parse: (raw: string) => ParseResult<T>;
}): ParseResult<T> {
	const raw = actionInput(args.env, args.name);
	if (raw === undefined) {
		return { kind: "invalid", message: `${args.name} is required` };
	}
	return args.parse(raw);
}

function optionalInput<T>(args: {
	env: Env;
	name: string;
	parse: (raw: string) => ParseResult<T>;
}): ParseResult<T | undefined> {
	const raw = actionInput(args.env, args.name);
	if (raw === undefined) {
		return { kind: "ok", value: undefined };
	}
	return args.parse(raw);
}

function parseConsumerRef(env: Env): ParseResult<RepoRef> {
	const parts = requiredInput({
		env,
		name: "target_repo",
		parse: parseRepoRef,
	});
	if (parts.kind === "invalid") {
		return parts;
	}
	const id = requiredInput({ env, name: "consumer_repo_id", parse: repoId });
	if (id.kind === "invalid") {
		return id;
	}
	return repoRefFromParts({ id: id.value, parts: parts.value });
}

function parseCommentId(raw: string): ParseResult<CommentId> {
	return commentId(Number(raw));
}

function parseRouteGeneration(raw: string): ParseResult<number> {
	const parsed = Number(raw);
	if (!Number.isInteger(parsed)) {
		return { kind: "invalid", message: "route_generation must be an integer" };
	}
	return { kind: "ok", value: parsed };
}

/** The identifiers every dispatch must carry. */
function parseRunIds(env: Env): ParseResult<{
	consumer: RepoRef;
	dispatch: DispatchId;
	install: GithubInstallationId;
	pull: PullNumber;
}> {
	const consumer = parseConsumerRef(env);
	if (consumer.kind === "invalid") {
		return consumer;
	}
	const pull = requiredInput({
		env,
		name: "pull_number",
		parse: (raw) => pullNumber(Number(raw)),
	});
	if (pull.kind === "invalid") {
		return pull;
	}
	const dispatch = requiredInput({
		env,
		name: "dispatch_id",
		parse: dispatchId,
	});
	if (dispatch.kind === "invalid") {
		return dispatch;
	}
	const install = requiredInput({
		env,
		name: "installation_id",
		parse: githubAppInstallationId,
	});
	if (install.kind === "invalid") {
		return install;
	}
	return {
		kind: "ok",
		value: {
			consumer: consumer.value,
			dispatch: dispatch.value,
			install: install.value,
			pull: pull.value,
		},
	};
}

/** Inputs a dispatch may omit; present values must still parse. */
function parseOptionalRefs(env: Env): ParseResult<{
	comment: CommentId | undefined;
	generation: number | undefined;
	headSha: CommitSha | undefined;
	progress: CommentId | undefined;
}> {
	const comment = optionalInput({
		env,
		name: "comment_id",
		parse: parseCommentId,
	});
	if (comment.kind === "invalid") {
		return comment;
	}
	const progress = optionalInput({
		env,
		name: "progress_comment_id",
		parse: parseCommentId,
	});
	if (progress.kind === "invalid") {
		return progress;
	}
	const headSha = optionalInput({ env, name: "head_sha", parse: commitSha });
	if (headSha.kind === "invalid") {
		return headSha;
	}
	const generation = optionalInput({
		env,
		name: "route_generation",
		parse: parseRouteGeneration,
	});
	if (generation.kind === "invalid") {
		return generation;
	}
	return {
		kind: "ok",
		value: {
			comment: comment.value,
			generation: generation.value,
			headSha: headSha.value,
			progress: progress.value,
		},
	};
}

function parsePlan(args: {
	commentId: CommentId | undefined;
	kind: string;
	pullNumber: PullNumber;
}): ParseResult<Plan> {
	if (args.kind === "review") {
		return {
			kind: "ok",
			value: { kind: "review", pullNumber: args.pullNumber },
		};
	}
	if (args.kind === "mention" || args.kind === "fix") {
		if (args.commentId === undefined) {
			return {
				kind: "invalid",
				message: "comment_id is required for mention and fix plans",
			};
		}
		return {
			kind: "ok",
			value: {
				commentId: args.commentId,
				kind: args.kind,
				pullNumber: args.pullNumber,
			},
		};
	}
	return { kind: "invalid", message: "plan must be review, mention, or fix" };
}

export function parseHomeRunInputs(args: {
	env: Env;
}): ParseResult<HomeRunInputs> {
	const ids = parseRunIds(args.env);
	if (ids.kind === "invalid") {
		return ids;
	}
	const refs = parseOptionalRefs(args.env);
	if (refs.kind === "invalid") {
		return refs;
	}
	const planRaw = actionInput(args.env, "plan");
	if (planRaw === undefined) {
		return { kind: "invalid", message: "plan is required" };
	}
	const plan = parsePlan({
		commentId: refs.value.comment,
		kind: planRaw,
		pullNumber: ids.value.pull,
	});
	if (plan.kind === "invalid") {
		return plan;
	}
	return {
		kind: "ok",
		value: {
			commentId: refs.value.comment,
			consumer: ids.value.consumer,
			dispatchId: ids.value.dispatch,
			headSha: refs.value.headSha,
			installationId: ids.value.install,
			plan: plan.value,
			progressCommentId: refs.value.progress,
			pullNumber: ids.value.pull,
			routeGeneration: refs.value.generation,
		},
	};
}
