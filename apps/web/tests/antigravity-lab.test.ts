import { expect, test } from "vitest";

import { ENGINE_OPTIONS, credentialFieldFor } from "#/lab/constants.ts";

test("ENGINE_OPTIONS includes antigravity", () => {
	const kinds = ENGINE_OPTIONS.map((item) => item.kind);
	expect(kinds).toContain("antigravity");
});

test("credentialFieldFor describes antigravity oauth token", () => {
	expect(credentialFieldFor("antigravity").label).toContain("oauth");
	expect(credentialFieldFor("antigravity").hint).toContain("keyring");
	expect(credentialFieldFor("antigravity").hint).toContain("gi Secret");
});
