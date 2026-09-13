/**
 * The Worker half of the venue ladder (ADR-0037). It forwards one token request
 * to an allowlisted vendor URL and hands the body straight back: nothing here
 * parses the tokens, persists them, or logs them.
 */
import type { ParseResult } from "@hakasebot/core/domain.ts";
import { parseInvalid, parseOk } from "@hakasebot/core/domain.ts";
import type { CatalogHttp } from "@hakasebot/core/model-catalog.ts";
import type { TokenRequest } from "@hakasebot/core/vendor-login.ts";
import {
	performTokenRequest,
	vendorTokenUrl,
} from "@hakasebot/core/vendor-login.ts";
import { parseUnknown } from "@hakasebot/core/zod-parse.ts";
import { z } from "zod";

import type { DevUser } from "#/lib/dev-user.ts";
import type { AccessTokenFetcher } from "#/lib/github-session";
import { readUserSession } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

/**
 * A vendor token request is a handful of short fields. Anything larger is not
 * one, so the relay refuses it before it reaches a vendor.
 */
export const RELAY_BODY_LIMIT_BYTES = 8 * 1024;

const RELAY_KINDS = [
	"preflighted_json",
	"repeatable_form",
	"single_use_form",
] as const satisfies readonly TokenRequest["kind"][];

function relayKind(raw: string): TokenRequest["kind"] | undefined {
	for (const kind of RELAY_KINDS) {
		if (kind === raw) {
			return kind;
		}
	}
	return undefined;
}

/**
 * The only way caller input becomes a `TokenRequest`. The URL is checked
 * against the derived allowlist, so no caller can aim the relay at a host of
 * their choosing.
 */
export function parseRelayInput(input: {
	body: string;
	kind: string;
	url: string;
}): ParseResult<TokenRequest> {
	const kind = relayKind(input.kind);
	if (kind === undefined) {
		return parseInvalid(msg.vendor_login_relay_bad_kind());
	}
	const url = vendorTokenUrl(input.url);
	if (url.kind === "invalid") {
		return url;
	}
	if (new TextEncoder().encode(input.body).length > RELAY_BODY_LIMIT_BYTES) {
		return parseInvalid(msg.vendor_login_relay_body_too_large());
	}
	return parseOk({ body: input.body, kind, url: url.value });
}

/** The Worker's own fetch, wrapped so it never depends on `this`. */
const workerFetch: CatalogHttp = async (url, init) => fetch(url, init);

/**
 * `TokenResponse["json"]` is `unknown`, which a server fn cannot promise to
 * serialise. The body came out of `response.json()`, so re-reading it as plain
 * JSON is a shape check, not a schema: the relay still never inspects a field.
 */
const vendorJsonSchema = z.json().optional();

export interface RelayedToken {
	json: z.infer<typeof vendorJsonSchema>;
	status: number;
}

export interface RelaySessionDeps {
	cookieHeader: string;
	devUser?: DevUser;
	getAccessToken?: AccessTokenFetcher;
}

async function signedInLabUser(
	args: RelaySessionDeps,
): Promise<ParseResult<void>> {
	const session = await readUserSession({
		cookieHeader: args.cookieHeader,
		...(args.devUser === undefined ? {} : { devUser: args.devUser }),
		...(args.getAccessToken === undefined
			? {}
			: { getAccessToken: args.getAccessToken }),
	});
	if (session.kind === "missing") {
		return parseInvalid(msg.vendor_login_relay_unauthorised());
	}
	if (session.kind === "error") {
		return parseInvalid(session.message);
	}
	return parseOk(undefined);
}

/**
 * Signed-in Lab Users only. The vendor's status and JSON come back verbatim;
 * a vendor that cannot be reached is an invalid Result, never a thrown body.
 */
export async function relayVendorToken(
	args: RelaySessionDeps & {
		fetchImpl?: CatalogHttp;
		request: TokenRequest;
	},
): Promise<ParseResult<RelayedToken>> {
	const allowed = await signedInLabUser(args);
	if (allowed.kind === "invalid") {
		return allowed;
	}
	const outcome = await performTokenRequest({
		fetchImpl: args.fetchImpl ?? workerFetch,
		request: args.request,
	});
	if (outcome.kind === "unreachable") {
		return parseInvalid(outcome.message);
	}
	const json = parseUnknown(vendorJsonSchema, outcome.response.json);
	if (json.kind === "invalid") {
		return json;
	}
	return parseOk({ json: json.value, status: outcome.response.status });
}
