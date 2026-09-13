import { z } from "zod";

import {
	firstParsed,
	jsonObjectSchema,
	keepParsed,
	unknownArraySchema,
} from "./zod-parse.ts";

const NON_CODING_TOKENS = new Set([
	"ada",
	"aqa",
	"audio",
	"babbage",
	"bison",
	"dall",
	"dalle",
	"davinci",
	"embedding",
	"embeddings",
	"image",
	"imagen",
	"instruct",
	"moderation",
	"realtime",
	"rerank",
	"reranker",
	"search",
	"sora",
	"transcribe",
	"tts",
	"veo",
	"video",
	"whisper",
]);

const NON_CODING_VENDOR_TYPES = new Set([
	"audio",
	"embedding",
	"embeddings",
	"image",
	"moderation",
	"rerank",
]);

export function tokensFrom(value: string): string[] {
	return value
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((token) => token.length > 0);
}

function hasNonCodingToken(value: string): boolean {
	return tokensFrom(value).some((token) => NON_CODING_TOKENS.has(token));
}

const generationMethodSchema = z.string().min(1);

function generationMethodsFrom(
	item: Record<string, unknown>,
): string[] | undefined {
	const raw =
		item["supportedGenerationMethods"] ?? item["supported_generation_methods"];
	const listed = unknownArraySchema.safeParse(raw);
	if (!listed.success) {
		return undefined;
	}
	const methods = keepParsed(generationMethodSchema, listed.data);
	return methods.length === 0 ? undefined : methods;
}

function vendorTypeFrom(item: Record<string, unknown>): string | undefined {
	const capabilities = firstParsed(jsonObjectSchema, [item["capabilities"]]);
	const type = firstParsed(z.string().min(1), [capabilities?.["type"]]);
	return type?.toLowerCase();
}

export function isCodingVendorModel(args: {
	displayName: string;
	id: string;
	item: Record<string, unknown>;
}): boolean {
	const methods = generationMethodsFrom(args.item);
	if (methods !== undefined && !methods.includes("generateContent")) {
		return false;
	}
	const vendorType = vendorTypeFrom(args.item);
	if (vendorType !== undefined && NON_CODING_VENDOR_TYPES.has(vendorType)) {
		return false;
	}
	return !hasNonCodingToken(args.id) && !hasNonCodingToken(args.displayName);
}

const UNIX_SECONDS_CEILING_MS = 1e12;

const epochFromNumber = z
	.number()
	.positive()
	.transform((value) =>
		value < UNIX_SECONDS_CEILING_MS ? value * 1000 : value,
	);

const epochFromString = z
	.string()
	.min(1)
	.transform((value, ctx) => {
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) {
			ctx.addIssue({ code: "custom", message: "invalid date" });
			return z.NEVER;
		}
		return parsed;
	});

const epochMsSchema = z.union([epochFromNumber, epochFromString]);

export function isEolVendorModel(item: Record<string, unknown>): boolean {
	if (item["model_picker_enabled"] === false) {
		return true;
	}
	const shutdown = firstParsed(epochMsSchema, [item["shutdown_date"]]);
	return shutdown !== undefined && shutdown <= Date.now();
}

export function createdMsFrom(
	item: Record<string, unknown>,
): number | undefined {
	return firstParsed(epochMsSchema, [item["created"], item["created_at"]]);
}

export function compareNewestFirst(
	left: { createdMs: number | undefined; index: number },
	right: { createdMs: number | undefined; index: number },
): number {
	if (left.createdMs === undefined && right.createdMs === undefined) {
		return left.index - right.index;
	}
	if (left.createdMs === undefined) {
		return 1;
	}
	if (right.createdMs === undefined) {
		return -1;
	}
	return right.createdMs - left.createdMs || left.index - right.index;
}
