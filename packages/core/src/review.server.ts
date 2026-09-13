/** Facade: review domain split into cohesive modules; import path stays stable. */
export {
	SECRET_NAMES,
	actionRef,
	authJsonBlob,
	claudeOauthToken,
	commentMarkdown,
	contentHash,
	cursorLoginToken,
	effort,
	engineKind,
	exhaustive,
	fixPhrase,
	githubToken,
	lineCount,
	lineNumber,
	lineRange,
	modelName,
	parseRepoRef,
	replacementText,
	repoPath,
	reviewEventChoice,
	triggerPhrase,
} from "./domain.ts";

export type {
	EngineKind,
	EventDecision,
	Finding,
	Job,
	ParsedEvent,
	Phrases,
	PlanResult,
	ReviewEventChoice,
	ReviewReport,
	RunResult,
} from "./domain.ts";

export {
	defaultReviewPhrases,
	parseGithubEvent,
	planFromTrigger,
} from "./review/event.server.ts";
export {
	actionExitCode,
	decideReviewEvent,
	findingToReviewComment,
	formatPostedComment,
	noteCommentHeader,
	parseMarker,
	patchCommentHeader,
	renderReviewBody,
	renderSuggestionFence,
	reviewBodyHeader,
} from "./review/render.server.ts";
export {
	REVIEW_REPORT_FILENAME,
	consumerNotesFilename,
	isReviewReportShape,
	mergeAxisReports,
	parseCliReport,
	reviewReportWireSchema,
} from "./review/report.server.ts";
