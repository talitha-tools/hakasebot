/**
 * All vendor knowledge lives behind these two interfaces. Adapters are pure:
 * they shape requests and read responses, and never perform IO.
 */
import type { ParseResult } from "#/domain.ts";
import type {
	CallbackCode,
	DeviceGrant,
	OauthEngine,
	Pkce,
	StepOutcome,
	TokenRequest,
	TokenResponse,
} from "#/vendor-login/domain.ts";

/** Which request the response belongs to. A poll carries the grant it polled. */
export type ResponseStep =
	| { kind: "poll"; grant: DeviceGrant }
	| { kind: "exchange" };

export interface OnResponseArgs {
	step: ResponseStep;
	response: TokenResponse;
	now: number;
}

export interface AuthorizationCodeAdapter<E extends OauthEngine = OauthEngine> {
	engine: E;
	grant: "authorization_code";
	/** Full vendor authorize URL for this login. Rendered as a link. */
	authorizeUrl: (pkce: Pkce) => string;
	/** Liberal paste parsing: bare code, `code#state`, or a whole callback URL. */
	parseCallback: (text: string) => ParseResult<CallbackCode>;
	exchange: (code: string, pkce: Pkce) => TokenRequest;
	onResponse: (args: OnResponseArgs) => StepOutcome;
}

export interface DeviceCodeAdapter<E extends OauthEngine = OauthEngine> {
	engine: E;
	grant: "device_code";
	deviceCode: () => TokenRequest;
	parseDeviceGrant: (
		response: TokenResponse,
		now: number,
	) => ParseResult<DeviceGrant>;
	poll: (grant: DeviceGrant) => TokenRequest;
	onResponse: (args: OnResponseArgs) => StepOutcome;
}

export type VendorAdapter = AuthorizationCodeAdapter | DeviceCodeAdapter;
