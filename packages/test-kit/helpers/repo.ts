import { parseRepoRef, repoRefFromParts } from "@hakasebot/core/domain.ts";
import type { RepoRef } from "@hakasebot/core/domain.ts";

const stableIds = new Map<string, number>();
let nextAutoId = 100_000;

export function testRepoRef(fullName: string, id?: number | string): RepoRef {
	const parts = parseRepoRef(fullName);
	if (parts.kind === "invalid") {
		throw new Error(parts.message);
	}
	const resolvedId =
		id ??
		stableIds.get(fullName) ??
		(() => {
			nextAutoId += 1;
			const auto = nextAutoId;
			stableIds.set(fullName, auto);
			return auto;
		})();
	const built = repoRefFromParts({ id: resolvedId, parts: parts.value });
	if (built.kind === "invalid") {
		throw new Error(built.message);
	}
	return built.value;
}

export function githubRepoJson(
	fullName: string,
	id?: number | string,
): { full_name: string; id: number } {
	const ref = testRepoRef(fullName, id);
	return { full_name: fullName, id: Number(ref.id) };
}
