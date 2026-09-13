import type { ParseResult } from "@hakasebot/core/domain.ts";
import { githubAppPrivateKey } from "@hakasebot/core/domain.ts";
import { packMac, packMacHeader } from "@hakasebot/core/home/pack-mac.ts";
import type { HomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import { parseHomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import { isRecord } from "@hakasebot/core/is-record.ts";
import { labUrlFromEnvRecord } from "@hakasebot/core/lab-url.ts";
import type { TerminalWakeStatus } from "@hakasebot/core/wake-status.ts";
import type { DispatchId } from "@hakasebot/core/wake/domain.ts";

import { actionInput } from "./run-config.ts";

const FETCH_TIMEOUT_MS = 2500;

async function readJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function packFailureMessage(json: unknown, status: number): string {
	if (
		isRecord(json) &&
		typeof json["error"] === "string" &&
		json["error"].length > 0
	) {
		return json["error"];
	}
	return `runtime pack request failed (${String(status)})`;
}

async function packMacAuthorization(
	env: Record<string, string | undefined>,
	dispatchIdValue: DispatchId,
): Promise<string | undefined> {
	const raw = actionInput(env, "github_app_private_key");
	if (raw === undefined) {
		return undefined;
	}
	const pem = githubAppPrivateKey(raw);
	if (pem.kind === "invalid") {
		return undefined;
	}
	const mac = await packMac({ dispatchId: dispatchIdValue, pem: pem.value });
	return packMacHeader(mac);
}

async function parsePackResponse(
	response: Response,
): Promise<ParseResult<HomeRuntimePack>> {
	const json = await readJson(response);
	if (response.status === 404) {
		return {
			kind: "invalid",
			message: "runtime pack not found for this wake",
		};
	}
	if (!response.ok) {
		return {
			kind: "invalid",
			message: packFailureMessage(json, response.status),
		};
	}
	const parsed = parseHomeRuntimePack(json);
	if (parsed.kind === "invalid") {
		return {
			kind: "invalid",
			message: `runtime pack response is invalid: ${parsed.message}`,
		};
	}
	return parsed;
}

export async function fetchRuntimePack(args: {
	dispatchId: DispatchId;
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	labUrl?: string;
}): Promise<ParseResult<HomeRuntimePack>> {
	const env = args.env ?? {};
	const authorization = await packMacAuthorization(env, args.dispatchId);
	if (authorization === undefined) {
		return {
			kind: "invalid",
			message:
				"github app private key is missing; cannot fetch the runtime pack",
		};
	}
	const labUrl = args.labUrl ?? labUrlFromEnvRecord(env);
	if (labUrl === undefined) {
		return {
			kind: "invalid",
			message: "lab url is missing; cannot fetch the runtime pack",
		};
	}
	const fetchImpl = args.fetchImpl ?? fetch;
	const url = new URL("/api/home-runtime", labUrl);
	url.searchParams.set("dispatch_id", args.dispatchId);
	try {
		const response = await fetchImpl(url, {
			headers: { Authorization: authorization },
			method: "GET",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		return await parsePackResponse(response);
	} catch {
		return { kind: "invalid", message: "runtime pack unreachable" };
	}
}

export async function reportWakeStatus(args: {
	dispatchId: DispatchId;
	env: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	status: TerminalWakeStatus;
}): Promise<void> {
	const authorization = await packMacAuthorization(args.env, args.dispatchId);
	if (authorization === undefined) {
		return;
	}
	const labUrl = labUrlFromEnvRecord(args.env);
	if (labUrl === undefined) {
		return;
	}
	const fetchImpl = args.fetchImpl ?? fetch;
	const url = new URL("/api/wake-status", labUrl);
	url.searchParams.set("dispatch_id", args.dispatchId);
	try {
		await fetchImpl(url, {
			body: JSON.stringify({ status: args.status }),
			headers: {
				Authorization: authorization,
				"content-type": "application/json",
			},
			method: "PATCH",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
	} catch {
		// Best-effort; once-per-pr retry should not fail the Home job.
	}
}
