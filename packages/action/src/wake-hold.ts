import { exhaustive } from "@hakasebot/core/domain.ts";
import { labUrlFromEnvRecord } from "@hakasebot/core/lab-url.ts";
import type { DispatchId } from "@hakasebot/core/wake/domain.ts";
import { parseWakeStatus } from "@hakasebot/core/wake/domain.ts";
import { parseUnknown } from "@hakasebot/core/zod-parse.ts";
import { z } from "zod";

const FETCH_TIMEOUT_MS = 2500;

type DispatchHold =
	| { kind: "active" }
	| { kind: "inactive" }
	| { kind: "superseded" }
	| { kind: "unknown" };

interface WakeStatusResponse {
	status: string;
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

async function fetchWakeStatus(args: {
	dispatchId: DispatchId;
	fetchImpl?: typeof fetch;
	labUrl: string;
}): Promise<
	| { kind: "ok"; value: WakeStatusResponse }
	| { kind: "invalid"; message: string }
> {
	const fetchImpl = args.fetchImpl ?? fetch;
	const url = new URL("/api/wake-status", args.labUrl);
	url.searchParams.set("dispatch_id", args.dispatchId);
	try {
		const response = await fetchImpl(url, {
			method: "GET",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		const json = await readJson(response);
		if (response.status === 404) {
			return { kind: "invalid", message: "wake not found" };
		}
		if (!response.ok) {
			return {
				kind: "invalid",
				message: `wake-status ${String(response.status)}`,
			};
		}
		const parsed = parseUnknown(
			z.object(
				{ status: z.string() },
				{ error: "wake-status response is invalid" },
			),
			json,
		);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		return { kind: "ok", value: parsed.value };
	} catch {
		return { kind: "invalid", message: "wake-status unreachable" };
	}
}

async function dispatchStillActive(args: {
	dispatchId: DispatchId;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	labUrl?: string;
}): Promise<DispatchHold> {
	const labUrl = args.labUrl ?? labUrlFromEnvRecord(args.env ?? {});
	if (labUrl === undefined) {
		return { kind: "unknown" };
	}
	const status = await fetchWakeStatus({
		dispatchId: args.dispatchId,
		labUrl,
		...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
	});
	if (status.kind === "invalid") {
		return { kind: "unknown" };
	}
	const parsed = parseWakeStatus(status.value.status);
	if (parsed === undefined) {
		return { kind: "unknown" };
	}
	switch (parsed) {
		case "queued":
		case "dispatched": {
			return { kind: "active" };
		}
		case "superseded": {
			return { kind: "superseded" };
		}
		case "cancelled":
		case "failed": {
			return { kind: "inactive" };
		}
		default: {
			return exhaustive(parsed);
		}
	}
}

export type { DispatchHold };
export { dispatchStillActive };
