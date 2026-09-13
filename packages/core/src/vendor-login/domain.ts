/**
 * Vendor login state. Pure data: everything here survives JSON round-trip so a
 * browser can persist a login and resume it after a reload.
 */
import type { EngineKind, NonEmpty } from "#/domain.ts";
import { exhaustive } from "#/domain.ts";

/**
 * Engines with a public vendor-CLI login (PKCE or device code). cursor
 * (dashboard API key) has no such flow, so it stays paste-only and cannot
 * be represented here.
 */
export type OauthEngine = Extract<
	EngineKind,
	"claude" | "codex" | "grok" | "antigravity"
>;

export const OAUTH_ENGINES = [
	"claude",
	"codex",
	"grok",
	"antigravity",
] as const satisfies readonly OauthEngine[];

/** Narrowing gate for the Accounts form; `undefined` means paste only. */
export function oauthEngine(kind: EngineKind): OauthEngine | undefined {
	for (const engine of OAUTH_ENGINES) {
		if (engine === kind) {
			return engine;
		}
	}
	return undefined;
}

/** Whole-login lifetime, checked on every event that carries `now`. */
export const LOGIN_TTL_MS = 10 * 60 * 1000;

export type PkceVerifier = string & { readonly __brand: "PkceVerifier" };
export type PkceChallenge = string & { readonly __brand: "PkceChallenge" };
export type OauthState = string & { readonly __brand: "OauthState" };
export type RequestId = string & { readonly __brand: "RequestId" };

/**
 * PKCE material for one login. `challenge` is precomputed so the reducer stays
 * synchronous. Verifier and state are separate brands so they cannot be swapped
 * when building the authorize URL or checking a pasted callback.
 */
export interface Pkce {
	verifier: PkceVerifier;
	challenge: PkceChallenge;
	state: OauthState;
}

/**
 * A vendor URL we are willing to POST to. Only `urls.ts` mints one, from the
 * same table the relay allowlist is derived from.
 */
export type VendorTokenUrl = string & { readonly __brand: "VendorTokenUrl" };

export type Transport = "direct" | "relay";

/**
 * A token-endpoint request classified by what happens if the browser sends it
 * and cannot read the answer. The classification, not the vendor, picks the
 * transport.
 *
 * - preflighted_json: a JSON body forces a CORS preflight, so a forbidden origin
 *   means the real request never leaves and a single-use code survives to be
 *   relayed. Safe to try direct first.
 * - repeatable_form: a form body is a simple request (no preflight) but the
 *   request consumes nothing, so a blocked probe costs nothing.
 * - single_use_form: form body and consuming. A blocked probe would burn the
 *   code, so this one only goes through the relay.
 */
export type TokenRequest =
	| { kind: "preflighted_json"; url: VendorTokenUrl; body: string }
	| { kind: "repeatable_form"; url: VendorTokenUrl; body: string }
	| { kind: "single_use_form"; url: VendorTokenUrl; body: string };

/** Total over `TokenRequest["kind"]`; adapters cannot override it. */
export function transportsFor(request: TokenRequest): NonEmpty<Transport> {
	switch (request.kind) {
		case "preflighted_json":
		case "repeatable_form": {
			return ["direct", "relay"];
		}
		case "single_use_form": {
			return ["relay"];
		}
		default: {
			return exhaustive(request);
		}
	}
}

export function contentTypeFor(
	request: TokenRequest,
): "application/json" | "application/x-www-form-urlencoded" {
	switch (request.kind) {
		case "preflighted_json": {
			return "application/json";
		}
		case "repeatable_form":
		case "single_use_form": {
			return "application/x-www-form-urlencoded";
		}
		default: {
			return exhaustive(request);
		}
	}
}

/** What came back. `json` is undefined for non-JSON bodies (bot walls, 502s). */
export interface TokenResponse {
	status: number;
	json: unknown;
}

/** RFC 8628 grant (or a vendor's equivalent) in domain shape. Times are epoch ms. */
export interface DeviceGrant {
	deviceCode: string;
	userCode: string;
	verificationUrl: string;
	intervalMs: number;
	expiresAt: number;
}

/** Parsed callback paste. `state` is absent when the vendor's format omits it. */
export interface CallbackCode {
	code: string;
	state: OauthState | undefined;
}

/**
 * What an adapter makes of one vendor response.
 *
 * - pending: a device poll the user has not authorised yet (includes slow_down).
 * - next: another request before tokens (codex trades a device poll for an
 *   authorization code that still needs exchanging).
 * - credential: vault plaintext. The reducer re-validates it with the paste
 *   path's own validator before accepting.
 */
export type StepOutcome =
	| { kind: "pending"; retryAfterMs: number }
	| { kind: "next"; request: TokenRequest }
	| { kind: "credential"; plaintext: string }
	| { kind: "invalid"; message: string };

/** Position inside the protocol. Data only; the adapter is looked up by engine. */
export type LoginPhase =
	/** Waiting for the user to paste what the vendor handed back. */
	| { kind: "authorize"; pkce: Pkce; authorizeUrl: string }
	/** Waiting for the device-code response. */
	| { kind: "device_code"; requestId: RequestId }
	/** User is at the vendor; we poll at `pollAt`. `polling` is the in-flight poll. */
	| {
			kind: "device_wait";
			grant: DeviceGrant;
			pollAt: number;
			polling: RequestId | undefined;
	  }
	/** Waiting for the token exchange. */
	| { kind: "exchange"; requestId: RequestId };

export type VendorLoginState =
	| { kind: "idle" }
	| {
			kind: "active";
			engine: OauthEngine;
			startedAt: number;
			/** Monotonic per login; request ids are `${startedAt}:${seq}`. */
			seq: number;
			phase: LoginPhase;
	  }
	/** `plaintext` already passed validateCredentialPlaintext for `engine`. */
	| { kind: "done"; engine: OauthEngine; plaintext: string }
	| { kind: "failed"; engine: OauthEngine; message: string };

export type VendorLoginEvent =
	| { kind: "start"; engine: OauthEngine; pkce: Pkce; now: number }
	| { kind: "callback_pasted"; text: string; now: number }
	| {
			kind: "http_ok";
			requestId: RequestId;
			response: TokenResponse;
			now: number;
	  }
	/** Every transport failed to produce a readable response. */
	| { kind: "http_failed"; requestId: RequestId; message: string; now: number }
	| { kind: "tick"; now: number }
	| { kind: "cancel" }
	/** done | failed → idle so the block can offer another go. */
	| { kind: "reset" };

export type VendorLoginEffect =
	| { kind: "http"; requestId: RequestId; request: TokenRequest }
	/** Interpreter schedules a `tick` at `at` (epoch ms). */
	| { kind: "wake_at"; at: number }
	/** Hand the validated plaintext to the paste box. */
	| { kind: "credential"; engine: OauthEngine; plaintext: string };

/** Ignored events are no-ops (same state, no effects), never exceptions. */
export interface VendorLoginReduce {
	state: VendorLoginState;
	effects: readonly VendorLoginEffect[];
}

/**
 * What the user does next at the vendor. Both grants land here so the Accounts
 * block renders one prompt instead of switching on engine.
 */
export interface LoginPrompt {
	url: string;
	/** Device flows only: the code the user types at `url`. */
	userCode: string | undefined;
	next: "callback_paste" | "poll";
}

export type VendorLoginView =
	| { kind: "idle" }
	| { kind: "prompt"; prompt: LoginPrompt }
	| { kind: "busy" }
	| { kind: "done" }
	| { kind: "failed"; message: string };

function activeView(phase: LoginPhase): VendorLoginView {
	switch (phase.kind) {
		case "authorize": {
			return {
				kind: "prompt",
				prompt: {
					next: "callback_paste",
					url: phase.authorizeUrl,
					userCode: undefined,
				},
			};
		}
		case "device_wait": {
			return {
				kind: "prompt",
				prompt: {
					next: "poll",
					url: phase.grant.verificationUrl,
					userCode: phase.grant.userCode,
				},
			};
		}
		case "device_code":
		case "exchange": {
			return { kind: "busy" };
		}
		default: {
			return exhaustive(phase);
		}
	}
}

/** UI projection. Holds no vendor knowledge. */
export function viewOf(state: VendorLoginState): VendorLoginView {
	switch (state.kind) {
		case "idle": {
			return { kind: "idle" };
		}
		case "done": {
			return { kind: "done" };
		}
		case "failed": {
			return { kind: "failed", message: state.message };
		}
		case "active": {
			return activeView(state.phase);
		}
		default: {
			return exhaustive(state);
		}
	}
}
