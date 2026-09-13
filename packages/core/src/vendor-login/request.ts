/** Request constructors and the one HTTP call both venues share. */
import { errorMessage } from "#/error-message.ts";
import type { CatalogHttp } from "#/model-catalog.ts";

import type { TokenRequest, TokenResponse, VendorTokenUrl } from "./domain.ts";
import { contentTypeFor } from "./domain.ts";

/**
 * Property order of `json` is preserved into the body. Anthropic's exchange
 * mirrors the key order the native client emits, so callers pass an ordered
 * literal rather than building the object piecemeal.
 */
export function preflightedJsonPost(
	url: VendorTokenUrl,
	json: Record<string, string>,
): TokenRequest {
	return { body: JSON.stringify(json), kind: "preflighted_json", url };
}

export function repeatableFormPost(
	url: VendorTokenUrl,
	form: Record<string, string>,
): TokenRequest {
	return {
		body: new URLSearchParams(form).toString(),
		kind: "repeatable_form",
		url,
	};
}

export function singleUseFormPost(
	url: VendorTokenUrl,
	form: Record<string, string>,
): TokenRequest {
	return {
		body: new URLSearchParams(form).toString(),
		kind: "single_use_form",
		url,
	};
}

/**
 * - response: the vendor answered with any status. A non-JSON body leaves
 *   `json` undefined rather than failing the call.
 * - unreachable: no readable response at all (a CORS TypeError in the browser,
 *   a network failure anywhere). The browser tries the next transport; the
 *   Worker relay turns it into a failed server fn.
 */
export type HttpOutcome =
	| { kind: "response"; response: TokenResponse }
	| { kind: "unreachable"; message: string };

/**
 * Runs in the browser for the direct transport and on the Worker for the relay.
 * Sets only Content-Type; there are no vendor-specific headers. Never logs the
 * request or response body.
 */
export async function performTokenRequest(args: {
	request: TokenRequest;
	fetchImpl: CatalogHttp;
}): Promise<HttpOutcome> {
	let response: Response;
	try {
		response = await args.fetchImpl(args.request.url, {
			body: args.request.body,
			headers: { "Content-Type": contentTypeFor(args.request) },
			method: "POST",
		});
	} catch (error) {
		return {
			kind: "unreachable",
			message: errorMessage(error, "the vendor could not be reached"),
		};
	}
	let json: unknown;
	try {
		json = await response.json();
	} catch {
		json = undefined;
	}
	return { kind: "response", response: { json, status: response.status } };
}
