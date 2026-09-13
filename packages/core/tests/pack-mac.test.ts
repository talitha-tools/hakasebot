import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { expect, test } from "vitest";

import { constantTimeEqual } from "#/constant-time.ts";
import {
	authorizePackMac,
	packMac,
	packMacFromAuthorization,
	packMacHeader,
	verifyPackMac,
} from "#/home/pack-mac.ts";

const dispatchId = "abc123def4567890";
const pem = TEST_APP_PRIVATE_KEY;

test("packMacHeader prefixes hakase-pack bearer", () => {
	expect(packMacHeader("deadbeef")).toBe("Bearer hakase-pack.deadbeef");
});

test("packMacFromAuthorization reads the hex from the bearer header", () => {
	expect(packMacFromAuthorization("Bearer hakase-pack.ab")).toBe("ab");
	expect(packMacFromAuthorization(undefined)).toBeUndefined();
	expect(packMacFromAuthorization("Bearer other.ab")).toBeUndefined();
	expect(packMacFromAuthorization("Bearer hakase-pack.")).toBeUndefined();
});

test("verifyPackMac accepts a matching hex and rejects a mismatch", async () => {
	const expected = await packMac({ dispatchId, pem });
	expect(verifyPackMac({ expected, mac: expected })).toBe(true);
	expect(verifyPackMac({ expected, mac: expected.toUpperCase() })).toBe(true);
	expect(verifyPackMac({ expected, mac: "00".repeat(32) })).toBe(false);
	expect(verifyPackMac({ expected, mac: undefined })).toBe(false);
	expect(verifyPackMac({ expected, mac: "zz" })).toBe(false);
});

test("authorizePackMac is unset without a pem and unauthorized without a mac", async () => {
	expect(
		await authorizePackMac({
			authorization: undefined,
			dispatchId,
			pem: undefined,
		}),
	).toEqual({ kind: "unset" });
	expect(
		await authorizePackMac({
			authorization: undefined,
			dispatchId,
			pem,
		}),
	).toEqual({ kind: "unauthorized" });
	const mac = await packMac({ dispatchId, pem });
	expect(
		await authorizePackMac({
			authorization: packMacHeader(mac),
			dispatchId,
			pem,
		}),
	).toEqual({ kind: "ok" });
});

test("constantTimeEqual folds every byte", () => {
	expect(
		constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
	).toBe(true);
	expect(
		constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])),
	).toBe(false);
	expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(
		false,
	);
});
