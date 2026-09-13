const encoder = new TextEncoder();

const CHUNK_SIZE = 0x80_00;

/** Accepts bytes or a UTF-8 string. Chunked so large payloads never exceed the argument-count limit. */
export function base64Encode(data: Uint8Array | string): string {
	const bytes = typeof data === "string" ? encoder.encode(data) : data;
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
		binary += String.fromCodePoint(
			...bytes.subarray(offset, offset + CHUNK_SIZE),
		);
	}
	return btoa(binary);
}

export function base64UrlEncode(data: Uint8Array | string): string {
	return base64Encode(data)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

/** Strips whitespace (GitHub wraps content base64 in newlines); throws on invalid input. */
export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
	const compact = value.replaceAll(/\s/gu, "");
	let binary: string;
	try {
		binary = atob(compact);
	} catch {
		throw new Error("base64 value is invalid");
	}
	return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
}
