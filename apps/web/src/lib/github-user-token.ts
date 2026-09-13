import { githubUserToken } from "@hakasebot/core/domain.ts";
import type { GithubUserToken } from "@hakasebot/core/domain.ts";

/**
 * Brand a raw GitHub App user-to-server access-token string.
 * Returns undefined when missing or blank.
 */
export function githubUserTokenFromAccessToken(args: {
	accessToken: string | undefined;
}): GithubUserToken | undefined {
	if (args.accessToken === undefined) {
		return undefined;
	}
	const parsed = githubUserToken(args.accessToken.trim());
	if (parsed.kind === "invalid") {
		return undefined;
	}
	return parsed.value;
}
