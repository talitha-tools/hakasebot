import type {
	GithubInstallationId,
	ParseResult,
	RepoId,
	RepoRef,
} from "#/domain.ts";
import { repoId } from "#/domain.ts";
import { wakeWouldDispatch } from "#/wake/domain.ts";

const CLAIM_NOT_HELD_ERROR = "claim not held";

interface ClaimRoute {
	enabled: boolean;
	generation: number | undefined;
	home: { installationId: GithubInstallationId; repo: RepoRef } | undefined;
}

function parseClaimStatusRepo(url: URL): ParseResult<RepoId> {
	const raw = url.searchParams.get("repo");
	if (raw === null) {
		return { kind: "invalid", message: "repo query is required" };
	}
	return repoId(raw.trim());
}

function generationIfClaimed(route: ClaimRoute): number | undefined {
	if (!wakeWouldDispatch(route) || route.generation === undefined) {
		return undefined;
	}
	return route.generation;
}

async function handleClaimStatusGet(args: {
	findRoute?: (repoId: RepoId) => Promise<ParseResult<ClaimRoute>>;
	url: URL;
}): Promise<Response> {
	const parsed = parseClaimStatusRepo(args.url);
	if (parsed.kind === "invalid") {
		return Response.json({ error: parsed.message }, { status: 400 });
	}
	if (args.findRoute === undefined) {
		return Response.json({ error: "d1 unavailable" }, { status: 503 });
	}
	const found = await args.findRoute(parsed.value);
	if (found.kind === "invalid") {
		return Response.json({ error: found.message }, { status: 500 });
	}
	const generation = generationIfClaimed(found.value);
	if (generation === undefined) {
		return Response.json({ error: CLAIM_NOT_HELD_ERROR }, { status: 404 });
	}
	return Response.json({ generation }, { status: 200 });
}

export type { ClaimRoute };
export {
	CLAIM_NOT_HELD_ERROR,
	generationIfClaimed,
	handleClaimStatusGet,
	parseClaimStatusRepo,
};
