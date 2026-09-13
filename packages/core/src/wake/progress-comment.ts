import type { PullNumber, RepoRef } from "#/domain.ts";
import {
	layoutPostedComment,
	runLinkOrFallback,
} from "#/posted-comment-layout.ts";

import type { RunUrl } from "./domain.ts";

const MARKER_PREFIX = "<!-- home-wake ";
const MARKER_SUFFIX = " -->";

export function progressCommentPrKey(args: {
	consumer: RepoRef;
	pullNumber: PullNumber;
}): string {
	return `${String(args.consumer.id)}#${String(args.pullNumber)}`;
}

export function progressCommentMarker(prKey: string): string {
	return `${MARKER_PREFIX}${prKey}${MARKER_SUFFIX}`;
}

export function commentContainsWakeMarker(args: {
	body: string;
	prKey: string;
}): boolean {
	return args.body.includes(progressCommentMarker(args.prKey));
}

export function renderProgressComment(args: {
	prKey: string;
	runUrl: RunUrl | undefined;
	status: "queued" | "started";
	summary?: string;
}): string {
	const marker = progressCommentMarker(args.prKey);
	const prose = args.status === "queued" ? "waking up!!" : "looking!!";
	const body = layoutPostedComment({
		prose,
		...(args.summary === undefined || args.summary.length === 0
			? {}
			: { content: args.summary }),
		footer: runLinkOrFallback(args.runUrl),
	});
	return `${marker}\n${body}`;
}

export type FailureCommentKind =
	| "broken"
	| "failed"
	| "no-model-slots"
	| "no-run";

export function renderFailureComment(args: {
	kind: FailureCommentKind;
	runUrl: RunUrl | undefined;
	details?: string;
}): string {
	let prose: string;
	switch (args.kind) {
		case "broken": {
			prose = "aw!! it's broken!! (；′⌒`)";
			break;
		}
		case "no-model-slots": {
			prose = "aw!! no brains configured!! (；′⌒`)";
			break;
		}
		case "no-run": {
			prose = "aw!! the it ignored me!! (；′⌒`)";
			break;
		}
		case "failed": {
			prose = "aw!! the review flopped (；′⌒`)";
			break;
		}
	}
	return layoutPostedComment({
		prose,
		...(args.details === undefined || args.details.trim().length === 0
			? {}
			: { content: args.details.trim() }),
		footer: runLinkOrFallback(args.runUrl),
	});
}
