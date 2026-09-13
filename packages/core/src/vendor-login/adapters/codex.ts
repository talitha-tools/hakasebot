import { z } from "zod";

import type { ParseResult } from "#/domain.ts";
import { parseInvalid, parseOk } from "#/domain.ts";
import type {
	DeviceGrant,
	StepOutcome,
	TokenResponse,
} from "#/vendor-login/domain.ts";
import { projectCodexCredential } from "#/vendor-login/project.ts";
import {
	preflightedJsonPost,
	singleUseFormPost,
} from "#/vendor-login/request.ts";
import {
	VENDOR_CLIENTS,
	VENDOR_ENDPOINTS,
	VENDOR_POST_TARGETS,
} from "#/vendor-login/urls.ts";
import { parseUnknown } from "#/zod-parse.ts";

import type { DeviceCodeAdapter, OnResponseArgs } from "./adapter.ts";

/** OpenAI's device endpoints hand out a code that lives fifteen minutes. */
const DEVICE_LIFETIME_MS = 15 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5000;
/** The device endpoints answer these while the user has not finished. */
const PENDING_STATUSES = new Set([403, 404]);

const userCodeSchema = z.object(
	{
		device_auth_id: z
			.string({ error: "openai sent no device_auth_id" })
			.min(1, { error: "openai sent no device_auth_id" }),
		interval: z.union([z.number(), z.string()]).optional(),
		user_code: z.string().optional(),
		usercode: z.string().optional(),
	},
	{ error: "openai sent something that is not a device code" },
);

const devicePollSchema = z.object(
	{
		authorization_code: z
			.string({ error: "openai sent no authorization_code" })
			.min(1, { error: "openai sent no authorization_code" }),
		code_verifier: z
			.string({ error: "openai sent no code_verifier" })
			.min(1, { error: "openai sent no code_verifier" }),
	},
	{ error: "openai sent something that is not a device grant" },
);

function intervalMsOf(raw: number | string | undefined): number {
	const seconds = typeof raw === "string" ? Number(raw) : raw;
	if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
		return DEFAULT_INTERVAL_MS;
	}
	return seconds * 1000;
}

function successful(response: TokenResponse): boolean {
	return response.status >= 200 && response.status < 300;
}

function parseDeviceGrant(
	response: TokenResponse,
	now: number,
): ParseResult<DeviceGrant> {
	if (!successful(response)) {
		return parseInvalid(
			`openai knocked back the device request (${String(response.status)})`,
		);
	}
	const parsed = parseUnknown(userCodeSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const userCode = parsed.value.user_code ?? parsed.value.usercode ?? "";
	if (userCode.length === 0) {
		return parseInvalid("openai sent no user code");
	}
	return parseOk({
		deviceCode: parsed.value.device_auth_id,
		expiresAt: now + DEVICE_LIFETIME_MS,
		intervalMs: intervalMsOf(parsed.value.interval),
		userCode,
		verificationUrl: VENDOR_ENDPOINTS.codex.verification,
	});
}

function onPoll(args: OnResponseArgs, grant: DeviceGrant): StepOutcome {
	if (PENDING_STATUSES.has(args.response.status)) {
		return { kind: "pending", retryAfterMs: grant.intervalMs };
	}
	if (!successful(args.response)) {
		return {
			kind: "invalid",
			message: `openai knocked back the device poll (${String(args.response.status)})`,
		};
	}
	const parsed = parseUnknown(devicePollSchema, args.response.json);
	if (parsed.kind === "invalid") {
		return { kind: "invalid", message: parsed.message };
	}
	// A form body that spends a single-use code: relay only, and the verifier is
	// the one the device endpoint minted, not this login's PKCE.
	return {
		kind: "next",
		request: singleUseFormPost(VENDOR_POST_TARGETS.codexToken, {
			grant_type: "authorization_code",
			client_id: VENDOR_CLIENTS.codex.clientId,
			code: parsed.value.authorization_code,
			redirect_uri: VENDOR_ENDPOINTS.codex.redirect,
			code_verifier: parsed.value.code_verifier,
		}),
	};
}

function onExchange(args: OnResponseArgs): StepOutcome {
	if (args.response.status !== 200) {
		return {
			kind: "invalid",
			message: `openai knocked back the token exchange (${String(args.response.status)})`,
		};
	}
	const projected = projectCodexCredential({
		json: args.response.json,
		now: args.now,
	});
	if (projected.kind === "invalid") {
		return { kind: "invalid", message: projected.message };
	}
	return { kind: "credential", plaintext: projected.value };
}

export const codexAdapter: DeviceCodeAdapter<"codex"> = {
	deviceCode() {
		return preflightedJsonPost(VENDOR_POST_TARGETS.codexDeviceCode, {
			client_id: VENDOR_CLIENTS.codex.clientId,
		});
	},
	engine: "codex",
	grant: "device_code",
	onResponse(args) {
		return args.step.kind === "poll"
			? onPoll(args, args.step.grant)
			: onExchange(args);
	},
	parseDeviceGrant,
	poll(grant) {
		return preflightedJsonPost(VENDOR_POST_TARGETS.codexDevicePoll, {
			device_auth_id: grant.deviceCode,
			user_code: grant.userCode,
		});
	},
};
