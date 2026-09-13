import type { GithubToken } from "@hakasebot/core/domain.ts";
import { workflowRunIdFromUrl } from "@hakasebot/core/github-api.server.ts";
import { runUrl } from "@hakasebot/core/wake/domain.ts";
import type { DispatchId, RunUrl } from "@hakasebot/core/wake/domain.ts";

import type { SupersededWakeRow } from "#/home/wake-run-row.ts";

import type { WakeDeps, WakeHome } from "./deps.server.ts";

const POLL_DELAYS_MS = [800, 1500, 2500] as const;

export function runNameFor(dispatchId: DispatchId): string {
	return `home-${dispatchId}`;
}

async function resolveWorkflowRunId(args: {
	deps: WakeDeps;
	home: WakeHome;
	homeToken: GithubToken;
	row: SupersededWakeRow;
}): Promise<string | undefined> {
	if (args.row.runUrl !== undefined) {
		const fromUrl = workflowRunIdFromUrl(args.row.runUrl);
		if (fromUrl.kind === "ok") {
			return fromUrl.value;
		}
	}
	const createdAfterIso = new Date(args.row.createdAt - 5000).toISOString();
	const found = await args.deps.github.findWorkflowRunByName({
		createdAfterIso,
		repo: args.home.repo,
		runName: runNameFor(args.row.dispatchId),
		token: args.homeToken,
	});
	if (found.kind !== "ok" || found.value === undefined) {
		return undefined;
	}
	const fromLookup = workflowRunIdFromUrl(found.value);
	return fromLookup.kind === "ok" ? fromLookup.value : undefined;
}

export async function cancelSupersededRuns(args: {
	deps: WakeDeps;
	home: WakeHome;
	homeToken: GithubToken;
	superseded: readonly SupersededWakeRow[];
}): Promise<void> {
	await Promise.all(
		args.superseded.map(async (row) => {
			const runId = await resolveWorkflowRunId({
				deps: args.deps,
				home: args.home,
				homeToken: args.homeToken,
				row,
			});
			if (runId === undefined) {
				return;
			}
			await args.deps.github.cancelWorkflowRun({
				repo: args.home.repo,
				runId,
				token: args.homeToken,
			});
		}),
	);
}

export async function pollRunUrl(args: {
	createdAfterIso: string;
	deps: WakeDeps;
	dispatchId: DispatchId;
	home: WakeHome;
}): Promise<
	| { kind: "found"; runUrl: RunUrl }
	| { kind: "broken"; details: string }
	| { kind: "missing" }
> {
	const token = await args.deps.github.mint(args.home.installationId);
	if (token.kind === "invalid") {
		return {
			kind: "broken",
			details: "couldn't get a github app token for the home repo",
		};
	}
	for (const delay of POLL_DELAYS_MS) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- backoff polling is inherently serial
		await args.deps.sleep(delay);
		// oxlint-disable-next-line eslint/no-await-in-loop -- each poll runs only if the prior one found nothing
		const found = await args.deps.github.findWorkflowRunByName({
			createdAfterIso: args.createdAfterIso,
			repo: args.home.repo,
			runName: runNameFor(args.dispatchId),
			token: token.value,
		});
		if (found.kind === "invalid") {
			return {
				kind: "broken",
				details: "couldn't list home Actions runs",
			};
		}
		if (found.value !== undefined) {
			const parsed = runUrl(found.value);
			if (parsed.kind === "ok") {
				return { kind: "found", runUrl: parsed.value };
			}
			return {
				kind: "broken",
				details: "home Actions run url looked wrong",
			};
		}
	}
	return { kind: "missing" };
}
