import type {
	GithubUserToken,
	GithubToken,
	ParseResult,
	RepoRef,
} from "#/domain.ts";
import type { RunUrl } from "#/wake/domain.ts";
import { keepParsed, parseArrayField } from "#/zod-parse.ts";

import { githubFetch } from "./http.server.ts";
import { workflowRunItemSchema } from "./json.ts";

export async function dispatchWorkflow(args: {
	inputs: Record<string, string>;
	ref: string;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
	workflowPath: string;
}): Promise<ParseResult<void>> {
	const encoded = encodeURIComponent(args.workflowPath);
	const response = await githubFetch({
		body: {
			inputs: args.inputs,
			ref: args.ref,
		},
		method: "POST",
		path: `/repos/${args.repo.owner}/${args.repo.name}/actions/workflows/${encoded}/dispatches`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export function workflowRunMatchesName(args: {
	displayTitle: unknown;
	name: unknown;
	runName: string;
}): boolean {
	return [args.name, args.displayTitle].some(
		(value) => typeof value === "string" && value.includes(args.runName),
	);
}

export function workflowRunIdFromUrl(
	runUrlValue: RunUrl | string,
): { kind: "ok"; value: string } | { kind: "invalid"; message: string } {
	const match = /\/actions\/runs\/(?<runId>\d+)(?:\/|$)/u.exec(runUrlValue);
	if (match?.groups?.["runId"] === undefined) {
		return { kind: "invalid", message: "workflow run id missing from url" };
	}
	return { kind: "ok", value: match.groups["runId"] };
}

export async function cancelWorkflowRun(args: {
	repo: RepoRef;
	runId: string;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<void>> {
	const response = await githubFetch({
		method: "POST",
		path: `/repos/${args.repo.owner}/${args.repo.name}/actions/runs/${args.runId}/cancel`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function findWorkflowRunByName(args: {
	createdAfterIso: string;
	repo: RepoRef;
	runName: string;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<string | undefined>> {
	const response = await githubFetch({
		path: `/repos/${args.repo.owner}/${args.repo.name}/actions/runs?event=workflow_dispatch&per_page=20`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const listed = parseArrayField(
		response.json,
		["workflow_runs"],
		"workflow runs response is invalid",
	);
	if (listed.kind === "invalid") {
		return listed;
	}
	const match = keepParsed(workflowRunItemSchema, listed.value).find((item) => {
		if (
			!workflowRunMatchesName({
				displayTitle: item.display_title,
				name: item.name,
				runName: args.runName,
			})
		) {
			return false;
		}
		return !(
			typeof item.created_at === "string" &&
			item.created_at < args.createdAfterIso
		);
	});
	return { kind: "ok", value: match?.html_url };
}
