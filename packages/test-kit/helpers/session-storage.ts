/** In-memory DOM Storage double for sessionStorage-backed code. */
function memorySessionStorage(): Storage {
	const data = new Map<string, string>();
	// oxlint-disable-next-line unicorn/no-null -- DOM Storage reports a missing entry as null
	const missing = null;
	return {
		get length() {
			return data.size;
		},
		clear() {
			data.clear();
		},
		getItem(key: string) {
			return data.get(key) ?? missing;
		},
		key(index: number) {
			return [...data.keys()][index] ?? missing;
		},
		removeItem(key: string) {
			data.delete(key);
		},
		setItem(key: string, value: string) {
			data.set(key, value);
		},
	};
}

export { memorySessionStorage };
