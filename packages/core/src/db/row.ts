/** First row of a Drizzle select, or undefined when empty. */
export function firstRow<T>(rows: readonly T[]): T | undefined {
	const [row] = rows;
	return row;
}

/** `SELECT COUNT(*) AS value` result as a number. */
export function countedNumber(rows: readonly { value: number }[]): number {
	return firstRow(rows)?.value ?? 0;
}
