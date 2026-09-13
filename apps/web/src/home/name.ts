import type { GithubAppSlug } from "@hakasebot/core/domain.ts";

export function homeRepoName(slug: GithubAppSlug | undefined): string {
	if (slug === undefined) {
		return "review-home";
	}
	return `${slug}-home`;
}
