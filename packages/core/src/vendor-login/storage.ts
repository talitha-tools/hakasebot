/**
 * Round-trip for the browser's short-lived login storage. Anything unknown,
 * truncated, or left over from an older shape parses to idle rather than
 * throwing, so a stale tab can only ever lose a login, never break one.
 */
import { z } from "zod";

import { brandString } from "#/domain.ts";
import { parseUnknown } from "#/zod-parse.ts";

import type { VendorLoginState } from "./domain.ts";
import { OAUTH_ENGINES } from "./domain.ts";

const engineSchema = z.enum(OAUTH_ENGINES);

const requestIdSchema = z
	.string()
	.min(1)
	.transform((value) => brandString(value, "RequestId"));

const pkceSchema = z.object({
	challenge: z
		.string()
		.min(1)
		.transform((value) => brandString(value, "PkceChallenge")),
	state: z
		.string()
		.min(1)
		.transform((value) => brandString(value, "OauthState")),
	verifier: z
		.string()
		.min(1)
		.transform((value) => brandString(value, "PkceVerifier")),
});

const grantSchema = z.object({
	deviceCode: z.string().min(1),
	expiresAt: z.number(),
	intervalMs: z.number().positive(),
	userCode: z.string().min(1),
	verificationUrl: z.string().min(1),
});

const phaseSchema = z.union([
	z.object({
		authorizeUrl: z.string().min(1),
		kind: z.literal("authorize"),
		pkce: pkceSchema,
	}),
	z.object({ kind: z.literal("device_code"), requestId: requestIdSchema }),
	z
		.object({
			grant: grantSchema,
			kind: z.literal("device_wait"),
			pollAt: z.number(),
			polling: requestIdSchema.optional(),
		})
		.transform((phase) => ({
			grant: phase.grant,
			kind: phase.kind,
			pollAt: phase.pollAt,
			polling: phase.polling ?? undefined,
		})),
	z.object({ kind: z.literal("exchange"), requestId: requestIdSchema }),
]);

const stateSchema: z.ZodType<VendorLoginState> = z.union([
	z.object({ kind: z.literal("idle") }),
	z.object({
		engine: engineSchema,
		kind: z.literal("active"),
		phase: phaseSchema,
		seq: z.number().int().nonnegative(),
		startedAt: z.number(),
	}),
	z.object({
		engine: engineSchema,
		kind: z.literal("done"),
		plaintext: z.string().min(1),
	}),
	z.object({
		engine: engineSchema,
		kind: z.literal("failed"),
		message: z.string().min(1),
	}),
]);

export function parseVendorLoginState(raw: string): VendorLoginState {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { kind: "idle" };
	}
	const parsed = parseUnknown(stateSchema, value);
	return parsed.kind === "ok" ? parsed.value : { kind: "idle" };
}
