import type { RepoRef, RepoRefParts } from "@hakasebot/core/domain.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	WakeMode,
} from "@hakasebot/core/wake/domain.ts";

export const WEB_APP_TABS = [
	"onboarding",
	"accounts",
	"models",
	"repos",
	"settings",
] as const;

export type WebAppTab = (typeof WEB_APP_TABS)[number];

export const INSTALL_STEPS = ["bot", "sync"] as const;

export type InstallStep = (typeof INSTALL_STEPS)[number];

export interface WebAppSearch {
	tab: WebAppTab;
	repo: RepoRefParts | undefined;
	install: InstallStep | undefined;
	view: "defaults" | undefined;
}

export interface HomeRepoSnapshot {
	installationReady: boolean;
	repo: RepoRef;
	secretsSyncedAt: number | undefined;
}

export interface WebAppSnapshot {
	githubUserId: string;
	hasSyncedRepo: boolean;
	home: HomeRepoSnapshot | undefined;
}

export interface EnabledRepo {
	repo: RepoRef;
	autoReviewCadence: AutoReviewCadence;
	botAt: number | undefined;
	homeAt: number | undefined;
	lastSyncedAt: number | undefined;
	syncedEpoch: number;
	wakeMode: WakeMode;
	autoAuthors: AutoAuthors;
	autoBranches: AutoBranches;
	prompt?: string;
	ignorePaths?: readonly string[];
}

export function formatRepoRef(repo: RepoRef | RepoRefParts): string {
	return `${repo.owner}/${repo.name}`;
}

export function githubRepoUrl(repo: RepoRef | RepoRefParts): string {
	return `https://github.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
}

export function sameRepoParts(
	left: RepoRefParts,
	right: RepoRefParts,
): boolean {
	return left.owner === right.owner && left.name === right.name;
}
