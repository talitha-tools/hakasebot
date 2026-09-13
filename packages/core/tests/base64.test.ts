import { expect, test } from "vitest";

import { base64Encode, base64ToBytes, base64UrlEncode } from "#/base64.ts";

test("base64 round-trips bytes and strings", () => {
	const bytes = new Uint8Array([0, 1, 2, 250, 255]);
	expect(base64ToBytes(base64Encode(bytes))).toEqual(bytes);
	expect(base64Encode("hakase")).toBe(btoa("hakase"));
});

test("base64ToBytes strips whitespace and rejects invalid input", () => {
	const wrapped = `${base64Encode("line-wrapped payload")}\n`.replace(
		"=",
		"=\n",
	);
	expect(base64ToBytes(wrapped)).toEqual(
		new TextEncoder().encode("line-wrapped payload"),
	);
	expect(base64ToBytes("   ")).toEqual(new Uint8Array(0));
	expect(() => base64ToBytes("***")).toThrow(/invalid/u);
});

test("base64UrlEncode emits the url alphabet without padding", () => {
	const bytes = new Uint8Array([251, 255, 190]);
	expect(base64Encode(bytes)).toBe("+/++");
	expect(base64UrlEncode(bytes)).toBe("-_--");
	expect(base64UrlEncode("a")).toBe("YQ");
});
