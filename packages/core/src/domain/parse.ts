export type NonEmpty<T> = [T, ...T[]];

export type ParseResult<T> =
	| { kind: "ok"; value: T }
	| { kind: "invalid"; message: string };

export function brandString<B extends string>(
	value: string,
	_brand: B,
): string & { readonly __brand: B } {
	void _brand;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- phantom brand constructor
	return value as string & { readonly __brand: B };
}

export function brandNumber<B extends string>(
	value: number,
	_brand: B,
): number & { readonly __brand: B } {
	void _brand;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- phantom brand constructor
	return value as number & { readonly __brand: B };
}

export function parseOk<T>(value: T): ParseResult<T> {
	return { kind: "ok", value };
}

export function parseInvalid<T>(message: string): ParseResult<T> {
	return { kind: "invalid", message };
}

export function requireText(value: string, label: string): ParseResult<string> {
	if (value.length === 0) {
		return parseInvalid(`${label} is empty`);
	}
	return parseOk(value);
}

export function requireSingleLine(
	value: string,
	label: string,
): ParseResult<string> {
	const parsed = requireText(value, label);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	if (/[\n\r\u2028\u2029]/u.test(parsed.value)) {
		return parseInvalid(`${label} cannot contain a newline`);
	}
	return parsed;
}

export function exhaustive(value: never): never {
	throw new Error(`unhandled value: ${String(value)}`);
}
