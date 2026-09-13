/** Satisfy Bun's `fetch.preconnect` when assigning mock fetch under `@types/bun`. */
export function asFetch(
	impl: (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => Response | Promise<Response>,
): typeof fetch {
	async function fetchImpl(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		return impl(input, init);
	}
	return Object.assign(fetchImpl, {
		preconnect(_url: string | URL): void {
			/* no-op under tests */
		},
	});
}
