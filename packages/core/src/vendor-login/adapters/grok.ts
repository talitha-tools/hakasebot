import { z } from "zod";

import type { ParseResult } from "#/domain.ts";
import { parseInvalid, parseOk } from "#/domain.ts";
import type {
	DeviceGrant,
	StepOutcome,
	TokenResponse,
} from "#/vendor-login/domain.ts";
import { projectGrokCredential } from "#/vendor-login/project.ts";
import { repeatableFormPost } from "#/vendor-login/request.ts";
import { VENDOR_CLIENTS, VENDOR_POST_TARGETS } from "#/vendor-login/urls.ts";
import { parseUnknown } from "#/zod-parse.ts";

import type { DeviceCodeAdapter, OnResponseArgs } from "./adapter.ts";

const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const DEFAULT_INTERVAL_MS = 5000;
/** RFC 8628 §3.5: a slow_down means add five seconds and keep going. */
const SLOW_DOWN_STEP_MS = 5000;
const MIN_LIFETIME_MS = 10 * 60 * 1000;

const deviceCodeSchema = z.object(
	{
		device_code: z
			.string({ error: "xai sent no device_code" })
			.min(1, { error: "xai sent no device_code" }),
		expires_in: z.number().int().positive().optional(),
		interval: z.number().int().positive().optional(),
		user_code: z
			.string({ error: "xai sent no user_code" })
			.min(1, { error: "xai sent no user_code" }),
		verification_uri: z.string().optional(),
		verification_uri_complete: z.string().optional(),
	},
	{ error: "xai sent something that is not a device code" },
);

const deviceErrorSchema = z.object({
	error: z.string().min(1),
	error_description: z.string().optional(),
});

function parseDeviceGrant(
	response: TokenResponse,
	now: number,
): ParseResult<DeviceGrant> {
	if (response.status !== 200) {
		return parseInvalid(
			`xai knocked back the device request (${String(response.status)})`,
		);
	}
	const parsed = parseUnknown(deviceCodeSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const grant = parsed.value;
	// The complete URI carries the user code, which saves the user typing it.
	const verificationUrl =
		grant.verification_uri_complete ?? grant.verification_uri;
	if (verificationUrl === undefined || verificationUrl.length === 0) {
		return parseInvalid("xai sent no verification address");
	}
	const lifetimeMs = (grant.expires_in ?? 0) * 1000;
	return parseOk({
		deviceCode: grant.device_code,
		expiresAt: now + Math.max(lifetimeMs, MIN_LIFETIME_MS),
		intervalMs:
			grant.interval === undefined || grant.interval <= 0
				? DEFAULT_INTERVAL_MS
				: grant.interval * 1000,
		userCode: grant.user_code,
		verificationUrl,
	});
}

function pendingOutcome(
	error: string,
	grant: DeviceGrant,
): StepOutcome | undefined {
	if (error === "authorization_pending") {
		return { kind: "pending", retryAfterMs: grant.intervalMs };
	}
	if (error === "slow_down") {
		return {
			kind: "pending",
			retryAfterMs: grant.intervalMs + SLOW_DOWN_STEP_MS,
		};
	}
	return undefined;
}

function deniedMessage(error: string, description: string | undefined): string {
	if (error === "expired_token") {
		return "that xai device code expired. start again";
	}
	if (error === "access_denied") {
		return "xai says that login was knocked back";
	}
	return `xai device login failed (${description ?? error})`;
}

function onExchange(args: OnResponseArgs): StepOutcome {
	if (args.response.status !== 200) {
		return {
			kind: "invalid",
			message: `xai knocked back the token request (${String(args.response.status)})`,
		};
	}
	const projected = projectGrokCredential({
		json: args.response.json,
		now: args.now,
	});
	if (projected.kind === "invalid") {
		return { kind: "invalid", message: projected.message };
	}
	return { kind: "credential", plaintext: projected.value };
}

function onPoll(args: OnResponseArgs, grant: DeviceGrant): StepOutcome {
	const failure = parseUnknown(deviceErrorSchema, args.response.json);
	if (failure.kind === "ok") {
		return (
			pendingOutcome(failure.value.error, grant) ?? {
				kind: "invalid",
				message: deniedMessage(
					failure.value.error,
					failure.value.error_description,
				),
			}
		);
	}
	return onExchange(args);
}

export const grokAdapter: DeviceCodeAdapter<"grok"> = {
	deviceCode() {
		// First request of the flow and non-consuming, so a blocked direct probe
		// only teaches the interpreter that this origin needs the relay.
		return repeatableFormPost(VENDOR_POST_TARGETS.grokDeviceCode, {
			client_id: VENDOR_CLIENTS.grok.clientId,
			scope: VENDOR_CLIENTS.grok.scope,
		});
	},
	engine: "grok",
	grant: "device_code",
	onResponse(args) {
		return args.step.kind === "poll"
			? onPoll(args, args.step.grant)
			: onExchange(args);
	},
	parseDeviceGrant,
	poll(grant) {
		return repeatableFormPost(VENDOR_POST_TARGETS.grokToken, {
			grant_type: DEVICE_CODE_GRANT,
			device_code: grant.deviceCode,
			client_id: VENDOR_CLIENTS.grok.clientId,
		});
	},
};
