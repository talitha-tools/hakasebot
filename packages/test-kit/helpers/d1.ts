import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

import type {
	D1DatabaseLike,
	D1PreparedStatement,
} from "@hakasebot/core/db/types.ts";

const INIT_SQL = readFileSync(
	fileURLToPath(
		new URL("../../../apps/web/migrations/0001_init.sql", import.meta.url),
	),
	"utf8",
);

const D1_UNDEFINED =
	"D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'";

function sqliteBind(values: unknown[]): SQLInputValue[] {
	if (values.includes(undefined)) {
		throw new Error(D1_UNDEFINED);
	}
	const bound: SQLInputValue[] = [];
	for (const value of values) {
		if (
			value === null ||
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "bigint" ||
			value instanceof Uint8Array
		) {
			bound.push(value);
			continue;
		}
		throw new Error(`unsupported sqlite bind: ${typeof value}`);
	}
	return bound;
}

function selectRows(
	sqlite: DatabaseSync,
	query: string,
	values: unknown[],
): Record<string, unknown>[] {
	const statement = sqlite.prepare(query);
	const params = sqliteBind(values);
	const rows = params.length === 0 ? statement.all() : statement.all(...params);
	return rows;
}

function boundStatement(
	sqlite: DatabaseSync,
	query: string,
	values: unknown[],
): D1PreparedStatement {
	const params = sqliteBind(values);
	return {
		bind(...next: unknown[]) {
			return boundStatement(sqlite, query, next);
		},
		async all() {
			await Promise.resolve();
			return { results: selectRows(sqlite, query, params) };
		},
		async first<T>(colName?: string) {
			await Promise.resolve();
			const [row] = selectRows(sqlite, query, params);
			if (row === undefined) {
				// oxlint-disable-next-line unicorn/no-null -- D1 first() uses null for a missing row
				return null;
			}
			if (colName === undefined) {
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- caller-asserted D1 row shape
				return row as T;
			}
			const value = row[colName];
			if (value === undefined) {
				// oxlint-disable-next-line unicorn/no-null -- D1 first(column) uses null for a missing cell
				return null;
			}
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- D1 first(column) is the cell
			return value as T;
		},
		async raw<T>() {
			await Promise.resolve();
			const statement = sqlite.prepare(query);
			const columns = statement.columns().map((column) => column.name);
			const rows = selectRows(sqlite, query, params);
			const cells: unknown[][] = rows.map((row) =>
				columns.map((name) => row[name]),
			);
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- D1 raw() is column-order arrays
			return cells as T[];
		},
		async run() {
			await Promise.resolve();
			const statement = sqlite.prepare(query);
			if (params.length === 0) {
				statement.run();
			} else {
				statement.run(...params);
			}
			return { success: true };
		},
	};
}

function sqliteAsD1(sqlite: DatabaseSync): D1DatabaseLike {
	return {
		prepare(query) {
			return boundStatement(sqlite, query, []);
		},
		async batch(statements) {
			sqlite.exec("BEGIN");
			try {
				const results: { success: boolean }[] = [];
				for (const statement of statements) {
					// oxlint-disable-next-line eslint/no-await-in-loop -- memory D1 batch mirrors D1 ordering
					results.push(await statement.run());
				}
				sqlite.exec("COMMIT");
				return results;
			} catch (error: unknown) {
				sqlite.exec("ROLLBACK");
				throw error;
			}
		},
	};
}

/** In-memory SQLite with the launch schema, duck-typed as D1. */
function memoryD1(): D1DatabaseLike {
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	sqlite.exec(INIT_SQL);
	sqlite.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    applied_at TIMESTAMP
  )`);
	sqlite
		.prepare("INSERT INTO d1_migrations (name) VALUES (?)")
		.run("0001_init.sql");
	return sqliteAsD1(sqlite);
}

/** One bound fake query — everything a handler needs to route on. */
interface FakeD1Call {
	query: string;
	values: unknown[];
}

interface FakeD1Handlers {
	all?: (call: FakeD1Call) => Record<string, unknown>[];
	first?: (call: FakeD1Call) => Record<string, unknown> | undefined;
	run?: (call: FakeD1Call) => { success: boolean };
}

function fakeD1Database(handlers: FakeD1Handlers): D1DatabaseLike {
	const bound = (query: string, values: unknown[]): D1PreparedStatement => {
		if (values.includes(undefined)) {
			throw new Error(D1_UNDEFINED);
		}
		const call: FakeD1Call = { query, values };
		return {
			bind(...next: unknown[]) {
				return bound(query, next);
			},
			async all() {
				await Promise.resolve();
				return { results: handlers.all?.(call) ?? [] };
			},
			async first<T>() {
				await Promise.resolve();
				const row = handlers.first?.(call);
				if (row === undefined) {
					// oxlint-disable-next-line unicorn/no-null -- D1 first() uses null for a missing row
					return null;
				}
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- caller-asserted D1 row shape
				return row as T;
			},
			async raw<T>() {
				await Promise.resolve();
				const results = handlers.all?.(call) ?? [];
				const cells: unknown[][] = results.map((row) => {
					const record: Record<string, unknown> = { ...row };
					return Object.keys(record).map((key) => record[key]);
				});
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fake raw() uses object values
				return cells as T[];
			},
			async run() {
				await Promise.resolve();
				return handlers.run?.(call) ?? { success: true };
			},
		};
	};
	return {
		prepare(query) {
			return bound(query, []);
		},
		async batch(statements) {
			const results: { success: boolean }[] = [];
			for (const statement of statements) {
				// oxlint-disable-next-line eslint/no-await-in-loop -- fake batch mirrors D1 ordering
				results.push(await statement.run());
			}
			return results;
		},
	};
}

export type { FakeD1Call, FakeD1Handlers };
export { fakeD1Database, memoryD1 };
