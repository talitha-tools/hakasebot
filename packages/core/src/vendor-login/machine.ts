/**
 * The pure login reducer. It knows two grant families and nothing about any
 * vendor: every vendor decision is an adapter call. Ignored events are no-ops,
 * never exceptions, so a stale reply after a cancel cannot fail a login.
 */
import { brandString, exhaustive } from "#/domain.ts";
import { validateCredentialPlaintext } from "#/vault/parse-credential.ts";

import { adapterFor } from "./adapters.ts";
import type {
	DeviceGrant,
	LoginPhase,
	OauthEngine,
	RequestId,
	StepOutcome,
	TokenRequest,
	VendorLoginEffect,
	VendorLoginEvent,
	VendorLoginReduce,
	VendorLoginState,
} from "./domain.ts";
import { LOGIN_TTL_MS } from "./domain.ts";

type ActiveState = Extract<VendorLoginState, { kind: "active" }>;
type EventOf<K extends VendorLoginEvent["kind"]> = Extract<
	VendorLoginEvent,
	{ kind: K }
>;

const NO_EFFECTS: readonly VendorLoginEffect[] = [];

const STATE_MISMATCH = "that code isn't from this login. start again";
const TIMED_OUT = "that login timed out. start again";
const CODE_EXPIRED = "that device code expired. start again";
const OFF_SCRIPT = "that login went sideways. start again";

function stay(state: VendorLoginState): VendorLoginReduce {
	return { effects: NO_EFFECTS, state };
}

function failed(engine: OauthEngine, message: string): VendorLoginReduce {
	return { effects: NO_EFFECTS, state: { engine, kind: "failed", message } };
}

/** Request ids are derived, so the reducer needs no entropy of its own. */
function sendRequest(
	flow: Pick<ActiveState, "engine" | "seq" | "startedAt">,
	request: TokenRequest,
	phaseOf: (requestId: RequestId) => LoginPhase,
): VendorLoginReduce {
	const seq = flow.seq + 1;
	const requestId = brandString(
		`${String(flow.startedAt)}:${String(seq)}`,
		"RequestId",
	);
	return {
		effects: [{ kind: "http", request, requestId }],
		state: {
			engine: flow.engine,
			kind: "active",
			phase: phaseOf(requestId),
			seq,
			startedAt: flow.startedAt,
		},
	};
}

function waitToPoll(
	state: ActiveState,
	grant: DeviceGrant,
	pollAt: number,
): VendorLoginReduce {
	return {
		effects: [{ at: pollAt, kind: "wake_at" }],
		state: {
			...state,
			phase: { grant, kind: "device_wait", pollAt, polling: undefined },
		},
	};
}

/** The vault's own validator decides whether a login result is holdable. */
function finish(state: ActiveState, plaintext: string): VendorLoginReduce {
	const valid = validateCredentialPlaintext({
		engine: state.engine,
		plaintext,
	});
	if (valid.kind === "invalid") {
		return failed(
			state.engine,
			`${state.engine} handed back something the vault can't hold`,
		);
	}
	return {
		effects: [{ engine: state.engine, kind: "credential", plaintext }],
		state: { engine: state.engine, kind: "done", plaintext },
	};
}

function advance(args: {
	state: ActiveState;
	outcome: StepOutcome;
	phase: LoginPhase;
	now: number;
}): VendorLoginReduce {
	const { now, outcome, phase, state } = args;
	switch (outcome.kind) {
		case "pending": {
			if (phase.kind !== "device_wait") {
				return failed(state.engine, OFF_SCRIPT);
			}
			return waitToPoll(
				state,
				{ ...phase.grant, intervalMs: outcome.retryAfterMs },
				now + outcome.retryAfterMs,
			);
		}
		case "next": {
			return sendRequest(state, outcome.request, (requestId) => ({
				kind: "exchange",
				requestId,
			}));
		}
		case "credential": {
			return finish(state, outcome.plaintext);
		}
		case "invalid": {
			return failed(state.engine, outcome.message);
		}
		default: {
			return exhaustive(outcome);
		}
	}
}

function start(event: EventOf<"start">): VendorLoginReduce {
	const adapter = adapterFor(event.engine);
	const flow = { engine: event.engine, seq: 0, startedAt: event.now };
	if (adapter.grant === "authorization_code") {
		return stay({
			...flow,
			kind: "active",
			phase: {
				authorizeUrl: adapter.authorizeUrl(event.pkce),
				kind: "authorize",
				pkce: event.pkce,
			},
		});
	}
	return sendRequest(flow, adapter.deviceCode(), (requestId) => ({
		kind: "device_code",
		requestId,
	}));
}

function onCallbackPasted(
	state: ActiveState,
	event: EventOf<"callback_pasted">,
): VendorLoginReduce {
	const { phase } = state;
	const adapter = adapterFor(state.engine);
	// A second paste while the exchange is in flight cannot double-spend the code.
	if (phase.kind !== "authorize" || adapter.grant !== "authorization_code") {
		return stay(state);
	}
	const parsed = adapter.parseCallback(event.text);
	if (parsed.kind === "invalid") {
		return failed(state.engine, parsed.message);
	}
	const pasted = parsed.value;
	if (pasted.state !== undefined && pasted.state !== phase.pkce.state) {
		return failed(state.engine, STATE_MISMATCH);
	}
	return sendRequest(
		state,
		adapter.exchange(pasted.code, phase.pkce),
		(requestId) => ({ kind: "exchange", requestId }),
	);
}

function onDeviceGrant(
	state: ActiveState,
	event: EventOf<"http_ok">,
): VendorLoginReduce {
	const adapter = adapterFor(state.engine);
	if (adapter.grant !== "device_code") {
		return stay(state);
	}
	const grant = adapter.parseDeviceGrant(event.response, event.now);
	if (grant.kind === "invalid") {
		return failed(state.engine, grant.message);
	}
	return waitToPoll(state, grant.value, event.now + grant.value.intervalMs);
}

function onHttpOk(
	state: ActiveState,
	event: EventOf<"http_ok">,
): VendorLoginReduce {
	const { phase } = state;
	const adapter = adapterFor(state.engine);
	if (phase.kind === "device_code") {
		return phase.requestId === event.requestId
			? onDeviceGrant(state, event)
			: stay(state);
	}
	if (phase.kind === "device_wait") {
		if (phase.polling !== event.requestId) {
			return stay(state);
		}
		const step = { grant: phase.grant, kind: "poll" } as const;
		const outcome = adapter.onResponse({
			now: event.now,
			response: event.response,
			step,
		});
		return advance({ now: event.now, outcome, phase, state });
	}
	if (phase.kind === "exchange" && phase.requestId === event.requestId) {
		const outcome = adapter.onResponse({
			now: event.now,
			response: event.response,
			step: { kind: "exchange" },
		});
		return advance({ now: event.now, outcome, phase, state });
	}
	return stay(state);
}

function onHttpFailed(
	state: ActiveState,
	event: EventOf<"http_failed">,
): VendorLoginReduce {
	const { phase } = state;
	if (phase.kind === "device_wait") {
		// A relay blip mid-poll is not fatal; the TTL and the grant bound retries.
		return phase.polling === event.requestId
			? waitToPoll(state, phase.grant, event.now + phase.grant.intervalMs)
			: stay(state);
	}
	if (phase.kind === "authorize" || phase.requestId !== event.requestId) {
		return stay(state);
	}
	return failed(state.engine, event.message);
}

function onTick(state: ActiveState, event: EventOf<"tick">): VendorLoginReduce {
	const { phase } = state;
	const adapter = adapterFor(state.engine);
	if (phase.kind !== "device_wait" || adapter.grant !== "device_code") {
		return stay(state);
	}
	if (event.now >= phase.grant.expiresAt) {
		return failed(state.engine, CODE_EXPIRED);
	}
	if (phase.polling !== undefined || event.now < phase.pollAt) {
		return stay(state);
	}
	return sendRequest(state, adapter.poll(phase.grant), (polling) => ({
		...phase,
		polling,
	}));
}

function onTimedEvent(
	state: ActiveState,
	event: Extract<
		VendorLoginEvent,
		| { kind: "callback_pasted" }
		| { kind: "http_ok" }
		| { kind: "http_failed" }
		| { kind: "tick" }
	>,
): VendorLoginReduce {
	if (event.now - state.startedAt > LOGIN_TTL_MS) {
		return failed(state.engine, TIMED_OUT);
	}
	switch (event.kind) {
		case "callback_pasted": {
			return onCallbackPasted(state, event);
		}
		case "http_ok": {
			return onHttpOk(state, event);
		}
		case "http_failed": {
			return onHttpFailed(state, event);
		}
		case "tick": {
			return onTick(state, event);
		}
		default: {
			return exhaustive(event);
		}
	}
}

export function reduceVendorLogin(
	state: VendorLoginState,
	event: VendorLoginEvent,
): VendorLoginReduce {
	switch (event.kind) {
		case "start": {
			return start(event);
		}
		case "cancel": {
			return stay(state.kind === "active" ? { kind: "idle" } : state);
		}
		case "reset": {
			return stay(
				state.kind === "done" || state.kind === "failed"
					? { kind: "idle" }
					: state,
			);
		}
		case "callback_pasted":
		case "http_failed":
		case "http_ok":
		case "tick": {
			return state.kind === "active" ? onTimedEvent(state, event) : stay(state);
		}
		default: {
			return exhaustive(event);
		}
	}
}
