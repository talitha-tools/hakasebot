/**
 * The browser half of a vendor login: short-lived tab storage, the venue
 * ladder, and the timer behind `wake_at`. Everything that decides *what* to
 * send lives in the core reducer; this file only carries it out.
 */
import type { CatalogHttp } from "@hakasebot/core/model-catalog.ts";
import type {
	HttpOutcome,
	TokenRequest,
	TokenResponse,
	Transport,
	VendorLoginState,
} from "@hakasebot/core/vendor-login.ts";
import {
	parseVendorLoginState,
	performTokenRequest,
	transportsFor,
} from "@hakasebot/core/vendor-login.ts";

import { m as msg } from "#/paraglide/messages.js";
import { relayVendorTokenFn } from "#/vendor-login/vendor-login-rpc.ts";

/** One login per tab. A second tab starts its own. */
const STORAGE_KEY = "hakasebot:vendor-login";

/**
 * Only an in-flight login is kept. A finished login holds vault plaintext, and
 * that belongs in the draft box the User is looking at, not in tab storage.
 */
export function saveVendorLogin(state: VendorLoginState): void {
	if (state.kind !== "active") {
		sessionStorage.removeItem(STORAGE_KEY);
		return;
	}
	sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadVendorLogin(): VendorLoginState {
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (raw === null) {
		return { kind: "idle" };
	}
	return parseVendorLoginState(raw);
}

export function clearVendorLogin(): void {
	sessionStorage.removeItem(STORAGE_KEY);
}

export type RelayFetch = (request: TokenRequest) => Promise<TokenResponse>;

const browserFetch: CatalogHttp = async (url, init) => fetch(url, init);

const relayThroughWorker: RelayFetch = async (request) => {
	const response = await relayVendorTokenFn({
		data: { body: request.body, kind: request.kind, url: request.url },
	});
	// RelayedToken.json is optional (zod); TokenResponse always carries a slot.
	return { json: response.json ?? undefined, status: response.status };
};

async function throughRelay(
	relay: RelayFetch,
	request: TokenRequest,
): Promise<HttpOutcome> {
	try {
		return { kind: "response", response: await relay(request) };
	} catch (error) {
		return {
			kind: "unreachable",
			message:
				error instanceof Error ? error.message : msg.vendor_login_failed(),
		};
	}
}

async function attempt(args: {
	fetchImpl: CatalogHttp;
	relay: RelayFetch;
	request: TokenRequest;
	transport: Transport;
}): Promise<HttpOutcome> {
	if (args.transport === "direct") {
		return performTokenRequest({
			fetchImpl: args.fetchImpl,
			request: args.request,
		});
	}
	return throughRelay(args.relay, args.request);
}

/**
 * Walks the venues the request's own kind allows, in order, and stops at the
 * first readable answer. A vendor that answers with an error status is an
 * answer: only an unreachable venue moves the ladder along.
 *
 * Recursive rather than a `for await` loop on purpose: venues carry
 * single-use codes, so the next rung must never fire until the current one
 * has settled. Parallelising them (as `Promise.all` would) would burn the
 * code against two venues at once.
 */
async function walkVenues(
	venue: { fetchImpl: CatalogHttp; relay: RelayFetch; request: TokenRequest },
	transports: readonly Transport[],
): Promise<HttpOutcome> {
	const [transport, ...rest] = transports;
	if (transport === undefined) {
		return { kind: "unreachable", message: msg.vendor_login_failed() };
	}
	const outcome = await attempt({ ...venue, transport });
	if (outcome.kind === "response" || rest.length === 0) {
		return outcome;
	}
	return walkVenues(venue, rest);
}

export async function sendTokenRequest(args: {
	fetchImpl?: CatalogHttp;
	relay?: RelayFetch;
	request: TokenRequest;
}): Promise<HttpOutcome> {
	return walkVenues(
		{
			fetchImpl: args.fetchImpl ?? browserFetch,
			relay: args.relay ?? relayThroughWorker,
			request: args.request,
		},
		transportsFor(args.request),
	);
}

/** Fires `run` at `at` (epoch ms). The returned function cancels it. */
export function scheduleWake(at: number, run: () => void): () => void {
	const timer = setTimeout(run, Math.max(0, at - Date.now()));
	return () => {
		clearTimeout(timer);
	};
}
