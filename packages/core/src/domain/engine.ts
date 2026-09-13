import { z } from "zod";

import { parseJsonText } from "#/zod-parse.ts";

import type { AppSecretWrite } from "./github-app.ts";
import type { NonEmpty, ParseResult } from "./parse.ts";
import { brandString, parseInvalid, parseOk, requireText } from "./parse.ts";

export type ModelName = string & { readonly __brand: "ModelName" };
export type ClaudeOauthToken = string & {
	readonly __brand: "ClaudeOauthToken";
};
export type CursorLoginToken = string & {
	readonly __brand: "CursorLoginToken";
};
export type AntigravityOauthToken = string & {
	readonly __brand: "AntigravityOauthToken";
};
export type AuthJsonBlob = string & { readonly __brand: "AuthJsonBlob" };

export type Effort = "low" | "medium" | "high" | "max";
export type EngineKind = "claude" | "codex" | "grok" | "cursor" | "antigravity";

export type EngineConfig =
	| {
			kind: "claude";
			credential: ClaudeOauthToken;
			model: ModelName;
			effort: Effort;
			fast: boolean;
	  }
	| {
			kind: "codex";
			credential: AuthJsonBlob;
			model: ModelName;
			effort: Effort;
			fast: boolean;
	  }
	| {
			kind: "grok";
			credential: AuthJsonBlob;
			model: ModelName;
			effort: Effort;
	  }
	| {
			kind: "cursor";
			credential: CursorLoginToken;
			model: ModelName;
			effort: Effort;
			fast: boolean;
	  }
	| {
			kind: "antigravity";
			credential: AntigravityOauthToken;
			model: ModelName;
			effort: Effort;
	  };

export interface CatalogModel {
	id: ModelName;
	displayName: string;
	/** Input token window when the vendor list includes one. */
	contextWindow?: number;
	/** Effort values this model accepts. Omitted when the vendor did not say. */
	efforts?: NonEmpty<Effort>;
	/** Fast/low-latency mode when the vendor list includes a flag. */
	supportsFast?: boolean;
}

export interface ModelCatalog {
	engine: EngineKind;
	models: NonEmpty<CatalogModel>;
	recommended: ModelName;
}

export type SecretWrite =
	| { kind: "claude"; token: ClaudeOauthToken }
	| { kind: "codex"; authJson: AuthJsonBlob }
	| { kind: "grok"; authJson: AuthJsonBlob }
	| { kind: "cursor"; token: CursorLoginToken }
	| { kind: "antigravity"; token: AntigravityOauthToken }
	| AppSecretWrite;

export type WriteSecretsResult =
	| { kind: "ok"; names: NonEmpty<string> }
	| { kind: "invalid"; message: string };

export const ENGINE_KINDS = [
	"claude",
	"codex",
	"grok",
	"cursor",
	"antigravity",
] as const satisfies readonly EngineKind[];

export const EFFORTS = [
	"low",
	"medium",
	"high",
	"max",
] as const satisfies readonly Effort[];

export function modelName(value: string): ParseResult<ModelName> {
	const parsed = requireText(value, "model");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "ModelName"));
}

export function catalogModel(args: {
	id: string;
	displayName: string;
	contextWindow?: number;
	efforts?: readonly Effort[];
	supportsFast?: boolean;
}): ParseResult<CatalogModel> {
	const id = modelName(args.id);
	if (id.kind === "invalid") {
		return id;
	}
	const displayName = requireText(args.displayName, "display name");
	if (displayName.kind === "invalid") {
		return displayName;
	}
	if (
		args.contextWindow !== undefined &&
		(!Number.isInteger(args.contextWindow) || args.contextWindow < 1)
	) {
		return parseInvalid("context window must be a positive integer");
	}
	const [firstEffort, ...restEfforts] = args.efforts ?? [];
	const efforts: NonEmpty<Effort> | undefined =
		firstEffort === undefined ? undefined : [firstEffort, ...restEfforts];
	return parseOk({
		displayName: displayName.value,
		id: id.value,
		...(args.contextWindow === undefined
			? {}
			: { contextWindow: args.contextWindow }),
		...(efforts === undefined ? {} : { efforts }),
		...(args.supportsFast === undefined
			? {}
			: { supportsFast: args.supportsFast }),
	});
}

export function catalogHasModel(
	catalog: ModelCatalog,
	model: ModelName,
): boolean {
	return catalog.models.some((item) => item.id === model);
}

export function modelCatalog(args: {
	engine: EngineKind;
	models: readonly CatalogModel[];
	recommended?: ModelName;
}): ParseResult<ModelCatalog> {
	const [first, ...rest] = args.models;
	if (first === undefined) {
		return parseInvalid("model catalog is empty");
	}
	const models: NonEmpty<CatalogModel> = [first, ...rest];
	const recommended = args.recommended ?? first.id;
	if (!models.some((item) => item.id === recommended)) {
		return parseInvalid("recommended model is not in the catalog");
	}
	return parseOk({
		engine: args.engine,
		models,
		recommended,
	});
}

export function effort(value: string): ParseResult<Effort> {
	for (const item of EFFORTS) {
		if (item === value) {
			return parseOk(item);
		}
	}
	return parseInvalid("effort must be low, medium, high, or max");
}

export function engineKind(value: string): ParseResult<EngineKind> {
	for (const item of ENGINE_KINDS) {
		if (item === value) {
			return parseOk(item);
		}
	}
	return parseInvalid("unknown engine");
}

export function claudeOauthToken(value: string): ParseResult<ClaudeOauthToken> {
	const parsed = requireText(value, "claude_code_oauth_token");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "ClaudeOauthToken"));
}

export function cursorLoginToken(value: string): ParseResult<CursorLoginToken> {
	const parsed = requireText(value, "cursor_login_token");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "CursorLoginToken"));
}

const antigravityOauthFieldsSchema = z
	.object(
		{
			token: z.object(
				{
					refresh_token: z
						.string({
							error: "antigravity oauth token is missing refresh_token",
						})
						.min(1, {
							error: "antigravity oauth token is missing refresh_token",
						}),
				},
				{ error: "antigravity oauth token is missing token" },
			),
		},
		{ error: "antigravity oauth token is not an object" },
	)
	.transform((payload) => ({ refreshToken: payload.token.refresh_token }));

const authJsonObjectSchema = z.looseObject(
	{},
	{ error: "auth.json must be a JSON object" },
);

export function parseAntigravityOauthFields(value: string): ParseResult<{
	refreshToken: string;
}> {
	return parseJsonText(
		antigravityOauthFieldsSchema,
		value,
		"antigravity oauth token is not valid JSON",
	);
}

export function antigravityOauthToken(
	value: string,
): ParseResult<AntigravityOauthToken> {
	const parsed = requireText(value, "antigravity_oauth_token");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const fields = parseAntigravityOauthFields(parsed.value);
	if (fields.kind === "invalid") {
		return fields;
	}
	return parseOk(brandString(parsed.value, "AntigravityOauthToken"));
}

export function authJsonBlob(value: string): ParseResult<AuthJsonBlob> {
	const parsed = parseJsonText(
		authJsonObjectSchema,
		value,
		"auth.json is not valid JSON",
	);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(value, "AuthJsonBlob"));
}
