import { exhaustive } from "@hakasebot/core/domain.ts";
import type { EngineKind, ReviewReport } from "@hakasebot/core/domain.ts";
import { parseCliReport } from "@hakasebot/core/review.server.ts";

import { normalizeAntigravityStdout } from "./engines/antigravity.ts";
import { extractJsonStdout } from "./engines/json-stdout.ts";

/**
 * Map vendor CLI stdout into the review-report JSON object string that
 * parseCliReport expects.
 */
export function normalizeEngineStdout(args: {
	engine: EngineKind;
	stdout: string;
}): string {
	switch (args.engine) {
		case "antigravity": {
			return normalizeAntigravityStdout(args.stdout);
		}
		case "claude":
		case "codex":
		case "grok":
		case "cursor": {
			return extractJsonStdout(args.stdout);
		}
		default: {
			return exhaustive(args.engine);
		}
	}
}

export async function loadValidatedReport(args: {
	engine: EngineKind;
	reportPath: string;
	stdout: string;
}): Promise<
	{ kind: "ok"; value: ReviewReport } | { kind: "invalid"; message: string }
> {
	try {
		const raw = await Bun.file(args.reportPath).text();
		return parseCliReport({ engine: args.engine, raw });
	} catch {
		const fromStdout = normalizeEngineStdout({
			engine: args.engine,
			stdout: args.stdout,
		});
		const parsed = parseCliReport({ engine: args.engine, raw: fromStdout });
		if (parsed.kind === "ok") {
			return parsed;
		}
		return {
			kind: "invalid",
			message: `${args.engine} report file missing at ${args.reportPath}`,
		};
	}
}
