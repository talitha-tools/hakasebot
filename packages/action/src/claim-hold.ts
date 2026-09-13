import { CLAIM_NOT_HELD_ERROR } from "@hakasebot/core/claim-status.ts";
import type { ParseResult, RepoRef } from "@hakasebot/core/domain.ts";
import { labUrlFromEnvRecord } from "@hakasebot/core/lab-url.ts";
import { parseUnknown } from "@hakasebot/core/zod-parse.ts";
import { z } from "zod";

const FETCH_TIMEOUT_MS = 2500;

type ClaimHold = { kind: "holds" } | { kind: "moved" } | { kind: "unknown" };

interface ClaimStatusResponse {
	generation: number;
}

function isClaimNotHeld(body: unknown): boolean {
	return z.object({ error: z.literal(CLAIM_NOT_HELD_ERROR) }).safeParse(body)
		.success;
}

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

async function fetchClaimStatus(args: {
	consumer: RepoRef;
	fetchImpl?: typeof fetch;
	labUrl: string;
}): Promise<ParseResult<ClaimStatusResponse>> {
	const fetchImpl = args.fetchImpl ?? fetch;
	const url = new URL("/api/claim-status", args.labUrl);
	url.searchParams.set("repo", String(args.consumer.id));
	try {
		const response = await fetchImpl(url, {
			method: "GET",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		const json = await readJson(response);
		if (response.status === 404 && isClaimNotHeld(json)) {
			return { kind: "invalid", message: CLAIM_NOT_HELD_ERROR };
		}
		if (!response.ok) {
			return {
				kind: "invalid",
				message: `claim-status ${String(response.status)}`,
			};
		}
		const parsed = parseUnknown(
			z.object(
				{
					generation: z
						.number({ error: "claim-status response is invalid" })
						.int({ error: "claim-status response is invalid" }),
				},
				{ error: "claim-status response is invalid" },
			),
			json,
		);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		return { kind: "ok", value: parsed.value };
	} catch {
		return { kind: "invalid", message: "claim-status unreachable" };
	}
}

async function claimStillHolds(args: {
	consumer: RepoRef;
	env?: Record<string, string | undefined>;
	expectedGeneration: number;
	fetchImpl?: typeof fetch;
	labUrl?: string;
}): Promise<ClaimHold> {
	const labUrl = args.labUrl ?? labUrlFromEnvRecord(args.env ?? {});
	if (labUrl === undefined) {
		return { kind: "unknown" };
	}
	const status = await fetchClaimStatus({
		consumer: args.consumer,
		labUrl,
		...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
	});
	if (status.kind === "invalid") {
		if (status.message === CLAIM_NOT_HELD_ERROR) {
			return { kind: "moved" };
		}
		return { kind: "unknown" };
	}
	if (status.value.generation !== args.expectedGeneration) {
		return { kind: "moved" };
	}
	return { kind: "holds" };
}

export type { ClaimHold };
export { claimStillHolds };
