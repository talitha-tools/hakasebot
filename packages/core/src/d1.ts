/** D1 rejects `undefined` bind values; SQL NULL must be bound as `null`. */
export function d1Bindable<T>(value: T | undefined): T | null {
	// oxlint-disable-next-line unicorn/no-null -- D1 bind contract: SQL NULL binds as null
	return value ?? null;
}

/** D1 reads SQL NULL as `null`; normalize to `undefined` at the row boundary. */
export function d1Value<T>(value: T | null | undefined): T | undefined {
	return value ?? undefined;
}
