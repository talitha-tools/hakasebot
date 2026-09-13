import type { ParseResult, RepoRef } from "@hakasebot/core/domain.ts";
import { authorizePackMac } from "@hakasebot/core/home/pack-mac.ts";
import type { HomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import type { DispatchId } from "@hakasebot/core/wake/domain.ts";

interface HomeRuntimeWake {
	consumer: RepoRef;
	githubUserId: string;
}

function parseHomeRuntimeDispatchId(
	url: URL,
): { kind: "ok"; value: DispatchId } | { kind: "invalid"; message: string } {
	const raw = url.searchParams.get("dispatch_id");
	if (raw === null || raw.length === 0) {
		return { kind: "invalid", message: "dispatch_id query is required" };
	}
	return dispatchId(raw);
}

async function handleHomeRuntimeGet(args: {
	appPrivateKey?: string | undefined;
	buildPack?: (wake: HomeRuntimeWake) => Promise<ParseResult<HomeRuntimePack>>;
	findWake?: (dispatchId: DispatchId) => Promise<HomeRuntimeWake | undefined>;
	request?: Request;
	url: URL;
}): Promise<Response> {
	const parsed = parseHomeRuntimeDispatchId(args.url);
	if (parsed.kind === "invalid") {
		return Response.json({ error: parsed.message }, { status: 400 });
	}
	const auth = await authorizePackMac({
		authorization: args.request?.headers.get("authorization"),
		dispatchId: parsed.value,
		pem: args.appPrivateKey,
	});
	if (auth.kind === "unset") {
		return Response.json({ error: "hosted app unset" }, { status: 503 });
	}
	if (auth.kind === "unauthorized") {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	if (args.findWake === undefined || args.buildPack === undefined) {
		return Response.json({ error: "d1 unavailable" }, { status: 503 });
	}
	const wake = await args.findWake(parsed.value);
	if (wake === undefined) {
		return Response.json({ error: "wake not found" }, { status: 404 });
	}
	const pack = await args.buildPack(wake);
	if (pack.kind === "invalid") {
		return Response.json({ error: pack.message }, { status: 500 });
	}
	return Response.json(pack.value, { status: 200 });
}

export type { HomeRuntimeWake };
export { handleHomeRuntimeGet, parseHomeRuntimeDispatchId };
