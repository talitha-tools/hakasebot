/**
 * Facade: vendor login mints the plaintext a User would otherwise paste, and
 * the existing seal path locks it (ADR-0037). Nothing here performs IO beyond
 * `performTokenRequest`, which takes the fetch it should use.
 */
export type {
	AuthorizationCodeAdapter,
	DeviceCodeAdapter,
	OnResponseArgs,
	ResponseStep,
	VendorAdapter,
} from "./vendor-login/adapters.ts";
export {
	adapterFor,
	antigravityAdapter,
	claudeAdapter,
	codexAdapter,
	grokAdapter,
	parseCallbackPaste,
} from "./vendor-login/adapters.ts";
export type {
	CallbackCode,
	DeviceGrant,
	LoginPhase,
	LoginPrompt,
	OauthEngine,
	OauthState,
	Pkce,
	PkceChallenge,
	PkceVerifier,
	RequestId,
	StepOutcome,
	TokenRequest,
	TokenResponse,
	Transport,
	VendorLoginEffect,
	VendorLoginEvent,
	VendorLoginReduce,
	VendorLoginState,
	VendorLoginView,
	VendorTokenUrl,
} from "./vendor-login/domain.ts";
export {
	LOGIN_TTL_MS,
	OAUTH_ENGINES,
	contentTypeFor,
	oauthEngine,
	transportsFor,
	viewOf,
} from "./vendor-login/domain.ts";
export { decodeJwtPayload } from "./vendor-login/jwt.ts";
export { reduceVendorLogin } from "./vendor-login/machine.ts";
export { createPkce } from "./vendor-login/pkce.ts";
export {
	CLAUDE_MIN_TOKEN_LIFETIME_S,
	projectAntigravityCredential,
	projectClaudeCredential,
	projectCodexCredential,
	projectGrokCredential,
	projectVendorCredential,
} from "./vendor-login/project.ts";
export type { HttpOutcome } from "./vendor-login/request.ts";
export {
	performTokenRequest,
	preflightedJsonPost,
	repeatableFormPost,
	singleUseFormPost,
} from "./vendor-login/request.ts";
export { parseVendorLoginState } from "./vendor-login/storage.ts";
export {
	ANTIGRAVITY_SCOPES,
	RELAY_ALLOWLIST,
	VENDOR_CLIENTS,
	VENDOR_ENDPOINTS,
	VENDOR_POST_TARGETS,
	antigravityLoginClient,
	vendorTokenUrl,
} from "./vendor-login/urls.ts";
