import type { StepOutcome } from "#/vendor-login/domain.ts";
import { projectClaudeCredential } from "#/vendor-login/project.ts";
import { preflightedJsonPost } from "#/vendor-login/request.ts";
import {
	VENDOR_CLIENTS,
	VENDOR_ENDPOINTS,
	VENDOR_POST_TARGETS,
} from "#/vendor-login/urls.ts";

import type { AuthorizationCodeAdapter, OnResponseArgs } from "./adapter.ts";
import { parseCallbackPaste } from "./callback.ts";

function onResponse(args: OnResponseArgs): StepOutcome {
	if (args.response.status !== 200) {
		return {
			kind: "invalid",
			message: `anthropic knocked back the code exchange (${String(args.response.status)}). try Login again later`,
		};
	}
	const projected = projectClaudeCredential(args.response.json);
	if (projected.kind === "invalid") {
		return { kind: "invalid", message: projected.message };
	}
	return { kind: "credential", plaintext: projected.value };
}

export const claudeAdapter: AuthorizationCodeAdapter<"claude"> = {
	authorizeUrl(pkce) {
		const params = new URLSearchParams({
			// `code=true` is what makes Anthropic print the code instead of
			// bouncing to a loopback port nothing here can listen on.
			code: "true",
			client_id: VENDOR_CLIENTS.claude.clientId,
			response_type: "code",
			redirect_uri: VENDOR_ENDPOINTS.claude.redirect,
			scope: VENDOR_CLIENTS.claude.scope,
			code_challenge: pkce.challenge,
			code_challenge_method: "S256",
			state: pkce.state,
		});
		return `${VENDOR_ENDPOINTS.claude.authorize}?${params.toString()}`;
	},
	engine: "claude",
	exchange(code, pkce) {
		// Key order mirrors what Claude Code puts on the wire.
		return preflightedJsonPost(VENDOR_POST_TARGETS.claudeToken, {
			grant_type: "authorization_code",
			code,
			redirect_uri: VENDOR_ENDPOINTS.claude.redirect,
			client_id: VENDOR_CLIENTS.claude.clientId,
			code_verifier: pkce.verifier,
			state: pkce.state,
		});
	},
	grant: "authorization_code",
	onResponse,
	parseCallback: parseCallbackPaste,
};
