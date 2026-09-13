import { describe, expect, test } from "vitest";

import { parseSelect, vaultAccountSelect } from "#/db/zod.ts";

const validAccount = {
	ciphertext: "cipher",
	createdAt: 1,
	engine: "claude",
	githubUserId: "1",
	id: "acct_1",
	iv: "iv",
	label: "work",
	updatedAt: 2,
};

describe("parseSelect", () => {
	test("accepts a vault account row", () => {
		expect(parseSelect(vaultAccountSelect, validAccount, "bad")).toEqual({
			kind: "ok",
			value: validAccount,
		});
	});

	test("rejects an unknown engine", () => {
		expect(
			parseSelect(
				vaultAccountSelect,
				{ ...validAccount, engine: "mystery" },
				"vault account row is invalid",
			),
		).toEqual({
			kind: "invalid",
			message: "vault account row is invalid",
		});
	});
});
