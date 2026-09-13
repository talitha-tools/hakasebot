import type { RepoRef } from "@hakasebot/core/domain.ts";

export function filterReposByQuery(args: {
	query: string;
	repos: RepoRef[];
}): RepoRef[] {
	const needle = args.query.trim().toLowerCase();
	if (needle.length === 0) {
		return args.repos;
	}
	return args.repos.filter((repo) =>
		`${repo.owner}/${repo.name}`.toLowerCase().includes(needle),
	);
}
