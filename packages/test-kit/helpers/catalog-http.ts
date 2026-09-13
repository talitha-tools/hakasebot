import type { CatalogHttp } from "@hakasebot/core/model-catalog.ts";

export function capturingJsonFetch(payload: unknown): {
	calls: { headers?: Record<string, string>; url: string }[];
	fetchImpl: CatalogHttp;
} {
	const calls: { headers?: Record<string, string>; url: string }[] = [];
	return {
		calls,
		fetchImpl: (url, init) => {
			calls.push({
				url,
				...(init?.headers === undefined ? {} : { headers: init.headers }),
			});
			return Response.json(payload);
		},
	};
}
