import { blake2b } from "blakejs";
import nacl from "tweetnacl";

/**
 * Libsodium `crypto_box_seal` without WASM — Workers disallow buffer-based
 * WebAssembly.instantiate (the path libsodium-wrappers uses).
 *
 * Format: ephemeral_pk ‖ box(m, recipient_pk, ephemeral_sk,
 *   nonce = blake2b(ephemeral_pk ‖ recipient_pk, 24))
 */
function cryptoBoxSeal(args: {
	message: Uint8Array;
	recipientPublicKey: Uint8Array;
}): Uint8Array {
	if (args.recipientPublicKey.length !== nacl.box.publicKeyLength) {
		throw new Error(
			`recipient public key must be ${String(nacl.box.publicKeyLength)} bytes`,
		);
	}
	const ephemeral = nacl.box.keyPair();
	const nonceInput = new Uint8Array(
		ephemeral.publicKey.length + args.recipientPublicKey.length,
	);
	nonceInput.set(ephemeral.publicKey, 0);
	nonceInput.set(args.recipientPublicKey, ephemeral.publicKey.length);
	const nonce = blake2b(nonceInput, undefined, nacl.box.nonceLength);
	const ciphertext = nacl.box(
		args.message,
		nonce,
		args.recipientPublicKey,
		ephemeral.secretKey,
	);
	if (ciphertext === null) {
		throw new Error("nacl.box failed to seal message");
	}
	const sealed = new Uint8Array(ephemeral.publicKey.length + ciphertext.length);
	sealed.set(ephemeral.publicKey, 0);
	sealed.set(ciphertext, ephemeral.publicKey.length);
	return sealed;
}

export { cryptoBoxSeal };
