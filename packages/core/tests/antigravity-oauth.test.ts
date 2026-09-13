import { expect, test } from "vitest";

import {
	antigravityOauthToken,
	parseAntigravityOauthFields,
} from "#/domain.ts";

const SAMPLE = JSON.stringify({
	auth_method: "consumer",
	token: {
		access_token: "ya29.test-access",
		expiry: "2099-01-01T00:00:00.000000000Z",
		refresh_token: "1//04-test-refresh",
		token_type: "Bearer",
	},
});

test("antigravityOauthToken accepts the agy token file", () => {
	const parsed = antigravityOauthToken(SAMPLE);
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	const fields = parseAntigravityOauthFields(parsed.value);
	expect(fields).toEqual({
		kind: "ok",
		value: { refreshToken: "1//04-test-refresh" },
	});
});

test("antigravityOauthToken rejects a gemini api key", () => {
	expect(antigravityOauthToken("AIzaSy-test-key").kind).toBe("invalid");
	expect(antigravityOauthToken("").kind).toBe("invalid");
	expect(
		antigravityOauthToken(JSON.stringify({ token: { access_token: "ya29.x" } }))
			.kind,
	).toBe("invalid");
	expect(
		antigravityOauthToken(
			JSON.stringify({ refresh_token: "1//04-flat-refresh" }),
		).kind,
	).toBe("invalid");
});
