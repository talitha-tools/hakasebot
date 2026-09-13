import { constantTimeEqual } from "@hakasebot/core/constant-time.ts";

import { env } from "#/env.ts";
import { m as msg } from "#/paraglide/messages.js";

export type HostConsoleAuth =
	| { kind: "ok"; value: undefined }
	| { kind: "invalid"; message: string };

export interface HostConsoleAuthConfig {
	configuredToken?: string | undefined;
}

const BEARER_PREFIX = "Bearer ";

const encoder = new TextEncoder();

// Digests are compared instead of raw tokens so length differences never leak.
async function tokensMatch(left: string, right: string): Promise<boolean> {
	const [leftDigest, rightDigest] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(left)),
		crypto.subtle.digest("SHA-256", encoder.encode(right)),
	]);
	return constantTimeEqual(
		new Uint8Array(leftDigest),
		new Uint8Array(rightDigest),
	);
}

function readConfiguredToken(
	config?: HostConsoleAuthConfig,
): string | undefined {
	const raw =
		config === undefined ? env.HOST_CONSOLE_TOKEN : config.configuredToken;
	if (raw === undefined) {
		return undefined;
	}
	const trimmed = raw.trim();
	return trimmed === "" ? undefined : trimmed;
}

export function hostConsoleEnabled(config?: HostConsoleAuthConfig): boolean {
	return readConfiguredToken(config) !== undefined;
}

export function assertHostConsoleEnabled(config?: HostConsoleAuthConfig): void {
	if (!hostConsoleEnabled(config)) {
		throw new Error("not found");
	}
}

export async function validateHostConsoleToken(
	authorizationHeader: string | undefined,
	config?: HostConsoleAuthConfig,
): Promise<HostConsoleAuth> {
	const configured = readConfiguredToken(config);
	if (configured === undefined) {
		return { kind: "invalid", message: "not found" };
	}
	if (authorizationHeader === undefined || authorizationHeader.trim() === "") {
		return { kind: "invalid", message: msg.host_token_missing() };
	}
	if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
		return { kind: "invalid", message: msg.host_token_missing() };
	}
	const token = authorizationHeader.slice(BEARER_PREFIX.length).trim();
	if (token.length === 0) {
		return { kind: "invalid", message: msg.host_token_missing() };
	}
	if (!(await tokensMatch(token, configured))) {
		return { kind: "invalid", message: msg.host_token_wrong() };
	}
	return { kind: "ok", value: undefined };
}

export async function requireHostConsoleAuth(
	authorizationHeader: string | undefined,
	config?: HostConsoleAuthConfig,
): Promise<void> {
	assertHostConsoleEnabled(config);
	const auth = await validateHostConsoleToken(authorizationHeader, config);
	if (auth.kind === "invalid") {
		throw new Error(auth.message);
	}
}
