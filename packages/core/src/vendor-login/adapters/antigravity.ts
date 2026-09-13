import type { StepOutcome } from "#/vendor-login/domain.ts";
import { projectAntigravityCredential } from "#/vendor-login/project.ts";
import { singleUseFormPost } from "#/vendor-login/request.ts";
import {
	antigravityLoginClient,
	VENDOR_ENDPOINTS,
	VENDOR_POST_TARGETS,
} from "#/vendor-login/urls.ts";

import type { AuthorizationCodeAdapter, OnResponseArgs } from "./adapter.ts";
import { parseCallbackPaste } from "./callback.ts";

function onResponse(args: OnResponseArgs): StepOutcome {
	if (args.response.status !== 200) {
		return {
			kind: "invalid",
			message: `google knocked back the code exchange (${String(args.response.status)})`,
		};
	}
	const projected = projectAntigravityCredential({
		json: args.response.json,
		now: args.now,
	});
	if (projected.kind === "invalid") {
		return { kind: "invalid", message: projected.message };
	}
	return { kind: "credential", plaintext: projected.value };
}

export const antigravityAdapter: AuthorizationCodeAdapter<"antigravity"> = {
	authorizeUrl(pkce) {
		const client = antigravityLoginClient();
		const params = new URLSearchParams({
			// Offline access plus a forced consent screen is what makes Google
			// return the refresh_token the vault insists on.
			access_type: "offline",
			client_id: client.clientId,
			prompt: "consent",
			redirect_uri: VENDOR_ENDPOINTS.antigravity.redirect,
			response_type: "code",
			scope: client.scope,
			code_challenge: pkce.challenge,
			code_challenge_method: "S256",
			state: pkce.state,
		});
		return `${VENDOR_ENDPOINTS.antigravity.authorize}?${params.toString()}`;
	},
	engine: "antigravity",
	exchange(code, pkce) {
		const client = antigravityLoginClient();
		return singleUseFormPost(VENDOR_POST_TARGETS.antigravityToken, {
			code,
			client_id: client.clientId,
			client_secret: client.clientSecret,
			redirect_uri: VENDOR_ENDPOINTS.antigravity.redirect,
			grant_type: "authorization_code",
			code_verifier: pkce.verifier,
		});
	},
	grant: "authorization_code",
	onResponse,
	parseCallback: parseCallbackPaste,
};
