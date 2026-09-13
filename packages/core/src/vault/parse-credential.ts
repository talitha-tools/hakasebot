import { engineKind } from "#/domain.ts";
import type { EngineKind, ParseResult } from "#/domain.ts";
import {
	parseEngineSecretWrite,
	secretValueFromWrite,
} from "#/engine-credential.ts";

import type { AccountId } from "./domain.ts";
import { newAccountId } from "./domain.ts";

export interface ParsedCredentialPaste {
	id: AccountId;
	secretValue: string;
}

export function parseCredentialPaste(args: {
	engine: EngineKind;
	raw: string;
	accountId?: AccountId;
}): ParseResult<ParsedCredentialPaste> {
	const parsedEngine = engineKind(args.engine);
	if (parsedEngine.kind === "invalid") {
		return parsedEngine;
	}
	const write = parseEngineSecretWrite({
		engine: parsedEngine.value,
		raw: args.raw,
	});
	if (write.kind === "invalid") {
		return write;
	}
	const secretValue = secretValueFromWrite(write.value);
	if (secretValue === undefined) {
		return {
			kind: "invalid",
			message: "credential paste produced no secret value",
		};
	}
	return {
		kind: "ok",
		value: {
			id: args.accountId ?? newAccountId(),
			secretValue,
		},
	};
}

export function validateCredentialPlaintext(args: {
	engine: EngineKind;
	plaintext: string;
}): ParseResult<void> {
	const parsed = parseCredentialPaste({
		engine: args.engine,
		raw: args.plaintext,
	});
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: undefined };
}
