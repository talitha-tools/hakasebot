import type { ParseResult } from "#/domain.ts";
import { brandString, parseInvalid, parseOk } from "#/domain.ts";
import type { CallbackCode } from "#/vendor-login/domain.ts";

function callbackCode(code: string, state: string | undefined): CallbackCode {
	return {
		code,
		state:
			state === undefined || state.length === 0
				? undefined
				: brandString(state, "OauthState"),
	};
}

function fromUrl(text: string): ParseResult<CallbackCode> {
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return parseInvalid("that does not look like a callback address");
	}
	const denied = url.searchParams.get("error");
	if (denied !== null) {
		return parseInvalid(`the vendor knocked that login back (${denied})`);
	}
	const code = url.searchParams.get("code");
	if (code === null || code.length === 0) {
		return parseInvalid("that address has no code in it");
	}
	const state = url.searchParams.get("state");
	return parseOk(callbackCode(code, state ?? undefined));
}

/**
 * Accepts whatever the vendor left the user holding: the whole failed loopback
 * address, the `code#state` an Anthropic code page prints, or a bare code.
 * Never throws, and never fetches the pasted address.
 */
export function parseCallbackPaste(text: string): ParseResult<CallbackCode> {
	const trimmed = text.trim();
	if (trimmed.length === 0) {
		return parseInvalid("paste the code the vendor gave you");
	}
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		return fromUrl(trimmed);
	}
	if (/\s/u.test(trimmed)) {
		return parseInvalid("that paste has spaces in it, so it is not a code");
	}
	const [code, state] = trimmed.split("#");
	if (code === undefined || code.length === 0) {
		return parseInvalid("that paste has no code in it");
	}
	return parseOk(callbackCode(code, state));
}
