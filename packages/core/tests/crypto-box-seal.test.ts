import sodium, { ready, to_string } from "libsodium-wrappers";
import { expect, test } from "vitest";

import { cryptoBoxSeal } from "#/crypto-box-seal.ts";

test("cryptoBoxSeal matches libsodium crypto_box_seal_open", async () => {
	await ready;
	const keyPair = sodium.crypto_box_keypair();
	const message = new TextEncoder().encode("hakasebot-sealed");
	const sealed = cryptoBoxSeal({
		message,
		recipientPublicKey: keyPair.publicKey,
	});
	const opened = sodium.crypto_box_seal_open(
		sealed,
		keyPair.publicKey,
		keyPair.privateKey,
	);
	expect(to_string(opened)).toBe("hakasebot-sealed");
});

test("cryptoBoxSeal rejects a wrong-length public key", () => {
	expect(() =>
		cryptoBoxSeal({
			message: new Uint8Array([1]),
			recipientPublicKey: new Uint8Array(16),
		}),
	).toThrow(/32 bytes/u);
});
