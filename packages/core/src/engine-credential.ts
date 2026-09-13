import {
	antigravityOauthToken,
	authJsonBlob,
	claudeOauthToken,
	cursorLoginToken,
	exhaustive,
} from "#/domain.ts";
import type { EngineKind, ParseResult, SecretWrite } from "#/domain.ts";

function authJsonWrite(
	kind: "codex" | "grok",
	raw: string,
): ParseResult<SecretWrite> {
	const blob = authJsonBlob(raw);
	if (blob.kind === "invalid") {
		return blob;
	}
	return { kind: "ok", value: { authJson: blob.value, kind } };
}

export function parseEngineSecretWrite(args: {
	engine: EngineKind;
	raw: string;
}): ParseResult<SecretWrite> {
	const trimmed = args.raw.trim();
	switch (args.engine) {
		case "claude": {
			const token = claudeOauthToken(trimmed);
			if (token.kind === "invalid") {
				return token;
			}
			return { kind: "ok", value: { kind: "claude", token: token.value } };
		}
		case "codex":
		case "grok": {
			return authJsonWrite(args.engine, trimmed);
		}
		case "cursor": {
			const token = cursorLoginToken(trimmed);
			if (token.kind === "invalid") {
				return token;
			}
			return { kind: "ok", value: { kind: "cursor", token: token.value } };
		}
		case "antigravity": {
			const token = antigravityOauthToken(trimmed);
			if (token.kind === "invalid") {
				return token;
			}
			return {
				kind: "ok",
				value: { kind: "antigravity", token: token.value },
			};
		}
		default: {
			return exhaustive(args.engine);
		}
	}
}

export function secretValueFromWrite(write: SecretWrite): string | undefined {
	switch (write.kind) {
		case "claude": {
			return write.token;
		}
		case "codex": {
			return write.authJson;
		}
		case "grok": {
			return write.authJson;
		}
		case "cursor": {
			return write.token;
		}
		case "antigravity": {
			return write.token;
		}
		case "app": {
			return undefined;
		}
		default: {
			return exhaustive(write);
		}
	}
}
