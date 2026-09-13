/**
 * Read a Bun.spawn pipe (ReadableStream) as UTF-8 text.
 * Action-only helper — not for the Lab/Worker.
 */
export async function readStreamText(
	stream: ReadableStream<Uint8Array> | number | null,
): Promise<string> {
	if (stream === null || typeof stream === "number") {
		return "";
	}
	return new Response(stream).text();
}
