const encoder = new TextEncoder();

/** SHA-256 HMAC hex digest via WebCrypto (portable across node, Bun, and Workers). */
export async function sha256HmacHex(
	secret: string,
	body: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
