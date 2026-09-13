import { z } from "zod";

import { authorizePackMac } from "#/home/pack-mac.ts";
import { dispatchId } from "#/wake/domain.ts";
import type { DispatchId } from "#/wake/domain.ts";
import { parseUnknown } from "#/zod-parse.ts";

const TERMINAL_WAKE_STATUSES = ["failed", "cancelled"] as const;
type TerminalWakeStatus = (typeof TERMINAL_WAKE_STATUSES)[number];

function parseWakeStatusDispatchId(
	url: URL,
): { kind: "ok"; value: DispatchId } | { kind: "invalid"; message: string } {
	const raw = url.searchParams.get("dispatch_id");
	if (raw === null || raw.length === 0) {
		return { kind: "invalid", message: "dispatch_id query is required" };
	}
	return dispatchId(raw);
}

const terminalWakeStatusSchema = z.object(
	{
		status: z.string({ error: "wake status body is invalid" }).pipe(
			z.enum(TERMINAL_WAKE_STATUSES, {
				error: "wake status is invalid",
			}),
		),
	},
	{ error: "wake status body is invalid" },
);

function parseWakeStatusPatchBody(
	body: unknown,
):
	| { kind: "ok"; value: TerminalWakeStatus }
	| { kind: "invalid"; message: string } {
	const parsed = parseUnknown(terminalWakeStatusSchema, body);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: parsed.value.status };
}

async function handleWakeStatusGet(args: {
	findWakeStatus?: (dispatchId: DispatchId) => Promise<string | undefined>;
	url: URL;
}): Promise<Response> {
	const parsed = parseWakeStatusDispatchId(args.url);
	if (parsed.kind === "invalid") {
		return Response.json({ error: parsed.message }, { status: 400 });
	}
	if (args.findWakeStatus === undefined) {
		return Response.json({ error: "d1 unavailable" }, { status: 503 });
	}
	const status = await args.findWakeStatus(parsed.value);
	if (status === undefined) {
		return Response.json({ error: "wake not found" }, { status: 404 });
	}
	return Response.json({ status }, { status: 200 });
}

async function handleWakeStatusPatch(args: {
	appPrivateKey?: string | undefined;
	finishWakeRun?: (
		dispatchId: DispatchId,
		status: TerminalWakeStatus,
	) => Promise<boolean>;
	request: Request;
	url: URL;
}): Promise<Response> {
	const parsed = parseWakeStatusDispatchId(args.url);
	if (parsed.kind === "invalid") {
		return Response.json({ error: parsed.message }, { status: 400 });
	}
	const auth = await authorizePackMac({
		authorization: args.request.headers.get("authorization"),
		dispatchId: parsed.value,
		pem: args.appPrivateKey,
	});
	if (auth.kind === "unset") {
		return Response.json({ error: "hosted app unset" }, { status: 503 });
	}
	if (auth.kind === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (args.finishWakeRun === undefined) {
		return Response.json({ error: "d1 unavailable" }, { status: 503 });
	}
	let body: unknown;
	try {
		body = await args.request.json();
	} catch {
		return Response.json(
			{ error: "wake status body is invalid" },
			{
				status: 400,
			},
		);
	}
	const terminal = parseWakeStatusPatchBody(body);
	if (terminal.kind === "invalid") {
		return Response.json({ error: terminal.message }, { status: 400 });
	}
	const updated = await args.finishWakeRun(parsed.value, terminal.value);
	if (!updated) {
		return Response.json({ error: "wake not found" }, { status: 404 });
	}
	return Response.json({ status: terminal.value }, { status: 200 });
}

export type { TerminalWakeStatus };
export {
	handleWakeStatusGet,
	handleWakeStatusPatch,
	parseWakeStatusDispatchId,
	parseWakeStatusPatchBody,
};
