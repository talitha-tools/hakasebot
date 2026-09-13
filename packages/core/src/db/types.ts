import { isRecord } from "#/is-record.ts";

export interface D1PreparedStatement {
	bind: (...values: unknown[]) => D1PreparedStatement;
	all: () => Promise<{ results: Record<string, unknown>[] }>;
	run: () => Promise<{ success: boolean }>;
	first: <T>(colName?: string) => Promise<T | null>;
	raw: <T>() => Promise<T[]>;
}

export interface D1DatabaseLike {
	prepare: (query: string) => D1PreparedStatement;
	batch: (statements: D1PreparedStatement[]) => Promise<{ success: boolean }[]>;
}

export function isD1Database(value: unknown): value is D1DatabaseLike {
	return isRecord(value) && typeof value["prepare"] === "function";
}
