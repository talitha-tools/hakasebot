export function constantTimeEqual(
	left: Uint8Array,
	right: Uint8Array,
): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (const [index, byte] of left.entries()) {
		// oxlint-disable-next-line eslint/no-bitwise -- constant-time comparison folds bytes with XOR/OR
		diff |= byte ^ (right[index] ?? 0);
	}
	return diff === 0;
}
