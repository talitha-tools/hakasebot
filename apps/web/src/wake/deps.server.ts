import type {
	CommentId,
	CommitSha,
	GithubInstallationId,
	GithubToken,
	ParseResult,
	Plan,
	PullNumber,
	RepoId,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import {
	cancelWorkflowRun,
	createIssueComment,
	deleteIssueComment,
	dispatchWorkflow,
	fetchPullHeadSha,
	fetchRepoDefaultBranch,
	findWorkflowRunByName,
	listIssueComments,
	mintInstallationToken,
	patchIssueComment,
} from "@hakasebot/core/github-api.server.ts";
import type { TerminalWakeStatus } from "@hakasebot/core/wake-status.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	DispatchId,
	RunUrl,
	WakeKey,
	WakeMode,
	WakeStatus,
} from "@hakasebot/core/wake/domain.ts";

import type { HostedBotApp } from "#/deployment-config.ts";
import type { ReleasedRepo, RepoRoute } from "#/home/route-store.ts";
import type { SupersededWakeRow } from "#/home/wake-run-row.ts";

import type { WebhookReceipt } from "./webhook-receipt.ts";

export interface WakeHome {
	installationId: GithubInstallationId;
	repo: RepoRef;
}

export interface WakeRoute {
	autoAuthors: AutoAuthors;
	autoBranches: AutoBranches;
	autoReviewCadence: AutoReviewCadence;
	enabled: boolean;
	generation: number | undefined;
	home: WakeHome | undefined;
	userGithubUserId?: string;
	wakeMode: WakeMode;
}

export interface WakeStore {
	clearInstallationIfMatches: (args: {
		installationId: GithubInstallationId;
	}) => Promise<ParseResult<void>>;
	disableRepo: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<void>>;
	findAutoWakeForPr: (args: {
		consumer: RepoRef;
		pullNumber: PullNumber;
	}) => Promise<
		| {
				dispatchId: DispatchId;
				status: WakeStatus | undefined;
				wakeKey: WakeKey;
		  }
		| undefined
	>;
	findRoute: (repoId: RepoId) => Promise<ParseResult<WakeRoute>>;
	getWakeStatus: (dispatchId: DispatchId) => Promise<WakeStatus | undefined>;
	finishWakeRun: (
		dispatchId: DispatchId,
		status: TerminalWakeStatus,
	) => Promise<boolean>;
	isWakeQueued: (dispatchId: DispatchId) => Promise<boolean>;
	repoHasModelSlots: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<boolean>>;
	insertWake: (row: {
		commentId: CommentId | undefined;
		consumer: RepoRef;
		dispatchId: DispatchId;
		githubUserId: string | undefined;
		headSha: string | undefined;
		home: WakeHome;
		key: WakeKey;
		plan: Plan;
		pullNumber: PullNumber;
		replace?: boolean;
	}) => Promise<"inserted" | "duplicate">;
	supersedeInFlightReviewWakes: (args: {
		consumer: RepoRef;
		dispatchId: DispatchId;
		pullNumber: PullNumber;
	}) => Promise<readonly SupersededWakeRow[]>;
	updateWake: (
		dispatchId: DispatchId,
		patch: {
			progressCommentId?: CommentId;
			runUrl?: RunUrl;
			status: string;
		},
	) => Promise<void>;
	updateWakeIfStatus: (
		dispatchId: DispatchId,
		expectedStatus: string,
		patch: {
			progressCommentId?: CommentId;
			runUrl?: RunUrl;
			status: string;
		},
	) => Promise<boolean>;
	releaseByInstallationId: (args: {
		installationId: GithubInstallationId;
	}) => Promise<ParseResult<ReleasedRepo[]>>;
	releaseReposByInstallationId: (args: {
		installationId: GithubInstallationId;
		repos: readonly RepoRef[];
	}) => Promise<ParseResult<ReleasedRepo[]>>;
	setBotInstallation: (args: {
		installationId: GithubInstallationId;
		repo: RepoRef;
	}) => Promise<ParseResult<RepoRoute>>;
}

export interface WakeGithub {
	cancelWorkflowRun: (args: {
		repo: RepoRef;
		runId: string;
		token: GithubToken;
	}) => Promise<ParseResult<void>>;
	createIssueComment: (args: {
		body: string;
		pullNumber: PullNumber;
		repo: RepoRef;
		token: GithubToken;
	}) => Promise<ParseResult<CommentId>>;
	dispatchWorkflow: (args: {
		inputs: Record<string, string>;
		ref: string;
		repo: RepoRef;
		token: GithubToken;
		workflowPath: string;
	}) => Promise<ParseResult<void>>;
	findWorkflowRunByName: (args: {
		createdAfterIso: string;
		repo: RepoRef;
		runName: string;
		token: GithubToken;
	}) => Promise<ParseResult<string | undefined>>;
	fetchPullHeadSha: (args: {
		pullNumber: PullNumber;
		repo: RepoRef;
		token: GithubToken;
	}) => Promise<ParseResult<CommitSha>>;
	fetchRepoDefaultBranch: (args: {
		repo: RepoRef;
		token: GithubToken;
	}) => Promise<ParseResult<string>>;
	listIssueComments: (args: {
		pullNumber: PullNumber;
		repo: RepoRef;
		token: GithubToken;
	}) => Promise<ParseResult<readonly { body: string; id: CommentId }[]>>;
	mint: (
		installationId: GithubInstallationId,
	) => Promise<ParseResult<GithubToken>>;
	patchIssueComment: (args: {
		body: string;
		commentId: CommentId;
		repo: RepoRef;
		token: GithubToken;
	}) => Promise<ParseResult<void>>;
	deleteIssueComment: (args: {
		commentId: CommentId;
		repo: RepoRef;
		token: GithubToken;
	}) => Promise<ParseResult<void>>;
}

export interface WakeDeps {
	github: WakeGithub;
	now: () => number;
	randomBytes: (size: number) => Uint8Array;
	recordWebhookReceipt: (receipt: WebhookReceipt) => Promise<void>;
	sleep: (ms: number) => Promise<void>;
	store: WakeStore;
	webhookSecret: string;
}

export function productionWakeGithub(args: {
	hostedApp: Extract<HostedBotApp, { kind: "configured" }>;
}): WakeGithub {
	return {
		cancelWorkflowRun,
		createIssueComment,
		dispatchWorkflow,
		fetchPullHeadSha,
		fetchRepoDefaultBranch,
		findWorkflowRunByName,
		listIssueComments,
		mint: async (installationId) => {
			const grant = await mintInstallationToken({
				appId: args.hostedApp.clientId,
				installationId,
				privateKey: args.hostedApp.privateKey,
			});
			if (grant.kind === "invalid") {
				return grant;
			}
			return { kind: "ok", value: grant.value.token };
		},
		patchIssueComment,
		deleteIssueComment,
	};
}
