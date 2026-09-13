/** Facade: wake domain split into cohesive modules; import path stays stable. */
export type {
	AuthorAssociation,
	AutoAuthorScope,
	AutoAuthors,
	AutoAuthorsCheck,
	PullAuthor,
} from "./auto-authors.ts";
export {
	AUTHOR_ASSOCIATIONS,
	AUTO_AUTHOR_SCOPES,
	FRIENDS_AUTHOR_ASSOCIATIONS,
	autoWakeAllowsAuthor,
	defaultAutoAuthors,
	parseAuthorAssociation,
	parseAutoAuthorScope,
	parseAutoAuthors,
	parseAutoAuthorsFromRow,
	parseSkipLogins,
	parseSkipLoginsColumn,
} from "./auto-authors.ts";
export type {
	AutoBranchScope,
	AutoBranches,
	AutoBranchesCheck,
} from "./auto-branches.ts";
export {
	AUTO_BRANCH_SCOPES,
	autoWakeAllowsBranch,
	branchMatchesAny,
	branchNameMatches,
	defaultAutoBranches,
	parseAutoBranchScope,
	parseAutoBranches,
	parseAutoBranchesFromRow,
	parseBranchNamesColumn,
} from "./auto-branches.ts";
export type {
	AutoWakeBlockingStatus,
	AutoWakeRetryableStatus,
	DispatchId,
	RunUrl,
	WakeDecision,
	WakeEvent,
	WakeIgnoreReason,
	WakeKey,
	WakeOutcome,
	WakeStatus,
} from "./decision.ts";
export {
	AUTO_WAKE_BLOCKING_STATUSES,
	AUTO_WAKE_RETRYABLE_STATUSES,
	WAKE_OUTCOME_KINDS,
	WAKE_STATUSES,
	autoWakeCadenceBlocks,
	autoWakeCadenceMayReplace,
	decideWake,
	dispatchId,
	newDispatchId,
	parseWakeStatus,
	runUrl,
	wakeKeyFor,
	wakeWouldDispatch,
} from "./decision.ts";
export type {
	AutoReviewCadence,
	RepoSettingDefaults,
	WakeMode,
} from "./repo-settings.ts";
export {
	AUTO_REVIEW_CADENCES,
	defaultAutoReviewCadence,
	defaultWakeMode,
	parseAutoReviewCadence,
	parseRepoSettingDefaultsInput,
	parseWakeMode,
	productRepoSettingDefaults,
	repoSettingDefaultsFromRow,
} from "./repo-settings.ts";
