import { z } from "zod";

import type { ParseResult } from "#/domain/parse.ts";

export function firstZodMessage(error: z.ZodError): string {
	const [issue] = error.issues;
	return issue?.message ?? "invalid input";
}

export function formatZodError(error: z.ZodError, root = "value"): string {
	return error.issues
		.map((issue) => {
			const where =
				issue.path.length === 0 ? root : issue.path.map(String).join(".");
			return `${where}: ${issue.message}`;
		})
		.join("; ");
}

export function parseUnknown<T>(
	schema: z.ZodType<T>,
	value: unknown,
): ParseResult<T> {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		return { kind: "invalid", message: firstZodMessage(parsed.error) };
	}
	return { kind: "ok", value: parsed.data };
}

export function parseJsonText<T>(
	schema: z.ZodType<T>,
	raw: string,
	notJsonMessage: string,
): ParseResult<T> {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { kind: "invalid", message: notJsonMessage };
	}
	return parseUnknown(schema, value);
}

export function fromParseResult<In, Out>(
	schema: z.ZodType<In>,
	parse: (value: In) => ParseResult<Out>,
): z.ZodType<Out> {
	return schema.transform((value, ctx) => {
		const parsed = parse(value);
		if (parsed.kind === "invalid") {
			ctx.addIssue({ code: "custom", message: parsed.message });
			return z.NEVER;
		}
		return parsed.value;
	});
}

export const jsonObjectSchema = z.custom<Record<string, unknown>>(
	(value): value is Record<string, unknown> =>
		typeof value === "object" && value !== null && !Array.isArray(value),
);

export const unknownArraySchema = z.array(z.unknown());

export function firstParsed<T>(
	schema: z.ZodType<T>,
	values: readonly unknown[],
): T | undefined {
	for (const value of values) {
		const parsed = schema.safeParse(value);
		if (parsed.success) {
			return parsed.data;
		}
	}
	return undefined;
}

export function keepParsed<T>(
	schema: z.ZodType<T>,
	items: readonly unknown[],
): T[] {
	const kept: T[] = [];
	for (const item of items) {
		const parsed = schema.safeParse(item);
		if (parsed.success) {
			kept.push(parsed.data);
		}
	}
	return kept;
}

export function parseUnknownArray(
	json: unknown,
	message: string,
): ParseResult<unknown[]> {
	return parseUnknown(z.array(z.unknown(), { error: message }), json);
}

export function parseArrayField(
	json: unknown,
	keys: readonly string[],
	notObjectMessage: string,
	missingMessage = notObjectMessage,
): ParseResult<unknown[]> {
	const envelope = jsonObjectSchema.safeParse(json);
	if (!envelope.success) {
		return { kind: "invalid", message: notObjectMessage };
	}
	const items = firstParsed(
		unknownArraySchema,
		keys.map((key) => envelope.data[key]),
	);
	if (items === undefined) {
		return { kind: "invalid", message: missingMessage };
	}
	return { kind: "ok", value: items };
}

/** True when the wire value is boolean true; missing or anything else is false. */
export const trueFlagSchema = z
	.unknown()
	.optional()
	.transform((value) => value === true);
