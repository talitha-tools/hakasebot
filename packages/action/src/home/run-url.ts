import { runUrl } from "@hakasebot/core/wake/domain.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";

export function homeRunUrlFromEnv(
	env: Record<string, string | undefined>,
): RunUrl | undefined {
	const server = env["GITHUB_SERVER_URL"];
	const repo = env["GITHUB_REPOSITORY"];
	const runId = env["GITHUB_RUN_ID"];
	if (
		server === undefined ||
		server.length === 0 ||
		repo === undefined ||
		repo.length === 0 ||
		runId === undefined ||
		runId.length === 0
	) {
		return undefined;
	}
	const parsed = runUrl(`${server}/${repo}/actions/runs/${runId}`);
	if (parsed.kind === "invalid") {
		return undefined;
	}
	return parsed.value;
}
