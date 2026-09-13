import { describe, expect, test } from "vitest";

import { authClient } from "#/lib/auth-client.ts";

describe("authClient", () => {
	test("exposes signIn.social for GitHub OAuth", () => {
		expect(typeof authClient.signIn).toBe("function");
		expect(typeof authClient.signIn.social).toBe("function");
	});
});
