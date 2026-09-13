import type { RunUrl } from "#/wake/domain.ts";

const RUN_LINK_FALLBACK = "run not listed yet";
const RUN_LINK_LABEL = "view the run";

function markdownRunLink(runLink: RunUrl): string {
	const href = runLink.replaceAll(">", "%3E");
	return `[${RUN_LINK_LABEL}](<${href}>)`;
}

function runLinkOrFallback(runLink: RunUrl | undefined): string {
	if (runLink === undefined) {
		return RUN_LINK_FALLBACK;
	}
	return markdownRunLink(runLink);
}

/** Hakase prose, rule, optional content, rule, then run footer. */
function layoutPostedComment(args: {
	prose: string;
	content?: string;
	footer: string;
}): string {
	const content = args.content?.trim();
	if (content === undefined || content.length === 0) {
		return `${args.prose}\n\n---\n\n${args.footer}`;
	}
	return `${args.prose}\n\n---\n\n${content}\n\n---\n\n${args.footer}`;
}

export { layoutPostedComment, runLinkOrFallback };
