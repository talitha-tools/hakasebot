import type { RepoRef, RepoRefParts } from "@hakasebot/core/domain.ts";
import type { ReactNode } from "react";

import { formatRepoRef, githubRepoUrl } from "#/web-app/domain.ts";

export function GithubRepoLink(props: {
	className?: string;
	repo: RepoRef | RepoRefParts;
}): ReactNode {
	const className =
		props.className === undefined
			? "text-accent-strong underline"
			: `text-accent-strong underline ${props.className}`;
	return (
		<a
			className={className}
			href={githubRepoUrl(props.repo)}
			rel="noreferrer"
			target="_blank"
		>
			{formatRepoRef(props.repo)}
		</a>
	);
}
