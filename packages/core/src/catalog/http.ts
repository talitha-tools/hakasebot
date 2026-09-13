import type { ParseResult } from "#/domain.ts";

export type CatalogHttp = (
	url: string,
	init?: {
		body?: string;
		headers?: Record<string, string>;
		method?: string;
	},
) => Response | Promise<Response>;

export function bearerListHeaders(apiKey: string): Record<string, string> {
	return { Authorization: `Bearer ${apiKey}` };
}

export async function fetchJsonList(args: {
	fetchImpl: CatalogHttp;
	headers?: Record<string, string>;
	label: string;
	url: string;
}): Promise<ParseResult<unknown>> {
	const response = await args.fetchImpl(
		args.url,
		args.headers === undefined ? {} : { headers: args.headers },
	);
	if (!response.ok) {
		return {
			kind: "invalid",
			message: `${args.label} model list failed (${String(response.status)})`,
		};
	}
	try {
		return { kind: "ok", value: await response.json() };
	} catch {
		return {
			kind: "invalid",
			message: `${args.label} model list is not JSON`,
		};
	}
}
