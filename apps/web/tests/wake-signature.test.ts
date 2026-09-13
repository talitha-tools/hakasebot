import { sha256HmacHex } from "@hakasebot/test-kit/helpers/hmac.ts";
import { expect, test } from "vitest";

import { verifyGithubSignature } from "#/wake/verify-signature.ts";

test("verifyGithubSignature accepts a matching sha256 hmac", async () => {
	const secret = "webhook-secret";
	const rawBody = '{"ok":true}';
	const digest = await sha256HmacHex(secret, rawBody);
	expect(
		await verifyGithubSignature({
			rawBody,
			secret,
			signatureHeader: `sha256=${digest}`,
		}),
	).toBe(true);
});

test("verifyGithubSignature rejects a missing or short signature", async () => {
	expect(
		await verifyGithubSignature({
			rawBody: "{}",
			secret: "x",
			signatureHeader: undefined,
		}),
	).toBe(false);
	expect(
		await verifyGithubSignature({
			rawBody: "{}",
			secret: "x",
			signatureHeader: "sha256=ab",
		}),
	).toBe(false);
});
