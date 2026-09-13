import { asFetch } from "./as-fetch.ts";

const GITHUB_API = "https://api.github.com";

interface MockResponse {
	status?: number;
	json: unknown;
}

interface FetchMockHandlers {
	cancelWorkflowRun?: (runId: string) => MockResponse;
	createGitRef?: (body: unknown) => MockResponse;
	createPull?: (body: unknown) => MockResponse;
	createReview?: (pullNumber: string, body: unknown) => MockResponse;
	createUserRepo?: (body: unknown) => MockResponse;
	getUser?: () => MockResponse;
	getUserById?: (userId: string) => MockResponse;
	collaboratorPermission?: (
		owner: string,
		name: string,
		login: string,
	) => MockResponse;
	patchRepo?: (owner: string, name: string, body: unknown) => MockResponse;
	dismissReview?: (pullNumber: string, reviewId: string) => MockResponse;
	getContents?: (path: string, ref: string | undefined) => MockResponse;
	getGitRef?: (ref: string) => MockResponse;
	getPull?: (pullNumber: string) => MockResponse;
	getPullFiles?: (pullNumber: string, page: string | undefined) => MockResponse;
	getRepo?: (owner: string, name: string) => MockResponse;
	getApp?: () => MockResponse;
	getAppHookConfig?: () => MockResponse;
	installationToken?: (installationId: string, body: unknown) => MockResponse;
	listPulls?: (query: string) => MockResponse;
	listReviews?: (pullNumber: string) => MockResponse;
	listUserRepos?: (query: URLSearchParams) => MockResponse;
	listUserInstallations?: () => MockResponse;
	listUserInstallationRepos?: (
		installationId: string,
		query: URLSearchParams,
	) => MockResponse;
	addUserInstallationRepo?: (
		installationId: string,
		repoId: string,
	) => MockResponse;
	userInstallation?: (login: string) => MockResponse;
	orgInstallation?: (login: string) => MockResponse;
	publicKey?: () => MockResponse;
	putContents?: (path: string, body: unknown) => MockResponse;
	deleteContents?: (path: string, body: unknown) => MockResponse;
	putSecret?: (name: string, body: unknown) => MockResponse;
	repoInstallation?: (owner: string, name: string) => MockResponse;
}

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	return input.url;
}

function respond(mock: MockResponse): Response {
	const status = mock.status ?? 200;
	if (status === 204) {
		return new Response(undefined, { status });
	}
	return Response.json(mock.json, {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function parseBody(init: RequestInit | undefined): unknown {
	if (typeof init?.body !== "string") {
		return undefined;
	}
	return JSON.parse(init.body) as unknown;
}

/** One matched GitHub request — path groups plus request context. */
interface RouteMatch {
	body: () => unknown;
	groups: Record<string, string | undefined>;
	handlers: FetchMockHandlers;
	url: URL;
}

interface Route {
	method: string;
	pattern: RegExp;
	/** Returns undefined to fall through when no handler covers the request. */
	handle: (match: RouteMatch) => MockResponse | undefined;
}

function group(match: RouteMatch, name: string): string {
	const value = match.groups[name];
	if (value === undefined) {
		throw new Error(`github fetch mock route is missing group: ${name}`);
	}
	return value;
}

// Order mirrors GitHub path specificity: longer literal paths first so e.g.
// pull files do not fall through to the bare repo route.
const ROUTES: Route[] = [
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/pulls\/(?<pull>\d+)$/u,
		handle: (match) => match.handlers.getPull?.(group(match, "pull")),
	},
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/pulls\/(?<pull>\d+)\/files$/u,
		handle: (match) =>
			match.handlers.getPullFiles?.(
				group(match, "pull"),
				match.url.searchParams.get("page") ?? undefined,
			) ?? { json: [] },
	},
	{
		method: "GET",
		pattern: /^\/user\/repos/u,
		handle: (match) => match.handlers.listUserRepos?.(match.url.searchParams),
	},
	{
		method: "GET",
		pattern: /^\/user\/installations\/(?<id>\d+)\/repositories$/u,
		handle: (match) =>
			match.handlers.listUserInstallationRepos?.(
				group(match, "id"),
				match.url.searchParams,
			),
	},
	{
		method: "PUT",
		pattern:
			/^\/user\/installations\/(?<id>\d+)\/repositories\/(?<repoId>\d+)$/u,
		handle: (match) =>
			match.handlers.addUserInstallationRepo?.(
				group(match, "id"),
				group(match, "repoId"),
			),
	},
	{
		method: "GET",
		pattern: /^\/user\/installations$/u,
		handle: (match) => match.handlers.listUserInstallations?.(),
	},
	{
		method: "GET",
		pattern: /^\/users\/(?<login>[^/]+)\/installation$/u,
		handle: (match) =>
			match.handlers.userInstallation?.(
				decodeURIComponent(group(match, "login")),
			),
	},
	{
		method: "GET",
		pattern: /^\/orgs\/(?<login>[^/]+)\/installation$/u,
		handle: (match) =>
			match.handlers.orgInstallation?.(
				decodeURIComponent(group(match, "login")),
			),
	},
	{
		method: "POST",
		pattern: /^\/user\/repos$/u,
		handle: (match) => match.handlers.createUserRepo?.(match.body()),
	},
	{
		method: "GET",
		pattern: /^\/user$/u,
		handle: (match) => match.handlers.getUser?.(),
	},
	{
		method: "GET",
		pattern: /^\/user\/(?<id>\d+)$/u,
		handle: (match) => match.handlers.getUserById?.(group(match, "id")),
	},
	{
		method: "GET",
		pattern:
			/^\/repos\/(?<owner>[^/]+)\/(?<name>[^/]+)\/collaborators\/(?<login>[^/]+)\/permission$/u,
		handle: (match) =>
			match.handlers.collaboratorPermission?.(
				group(match, "owner"),
				group(match, "name"),
				decodeURIComponent(group(match, "login")),
			),
	},
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/pulls\/(?<pull>\d+)\/reviews$/u,
		handle: (match) =>
			match.handlers.listReviews?.(group(match, "pull")) ?? { json: [] },
	},
	{
		method: "POST",
		pattern: /^\/repos\/[^/]+\/[^/]+\/pulls\/(?<pull>\d+)\/reviews$/u,
		handle: (match) =>
			match.handlers.createReview?.(group(match, "pull"), match.body()),
	},
	{
		method: "PUT",
		pattern:
			/^\/repos\/[^/]+\/[^/]+\/pulls\/(?<pull>\d+)\/reviews\/(?<id>\d+)\/dismissals$/u,
		handle: (match) =>
			match.handlers.dismissReview?.(group(match, "pull"), group(match, "id")),
	},
	{
		method: "GET",
		pattern: /^\/repos\/(?<owner>[^/]+)\/(?<name>[^/]+)\/installation$/u,
		handle: (match) =>
			match.handlers.repoInstallation?.(
				group(match, "owner"),
				group(match, "name"),
			),
	},
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/actions\/secrets\/public-key$/u,
		handle: (match) => match.handlers.publicKey?.(),
	},
	{
		method: "PUT",
		pattern: /^\/repos\/[^/]+\/[^/]+\/actions\/secrets\/(?<name>[^/]+)$/u,
		handle: (match) =>
			match.handlers.putSecret?.(group(match, "name"), match.body()),
	},
	{
		method: "GET",
		pattern: /^\/app\/hook\/config$/u,
		handle: (match) => match.handlers.getAppHookConfig?.(),
	},
	{
		method: "GET",
		pattern: /^\/app$/u,
		handle: (match) => match.handlers.getApp?.(),
	},
	{
		method: "POST",
		pattern: /^\/app\/installations\/(?<id>\d+)\/access_tokens$/u,
		handle: (match) =>
			match.handlers.installationToken?.(group(match, "id"), match.body()),
	},
	{
		method: "POST",
		pattern: /^\/repos\/[^/]+\/[^/]+\/actions\/runs\/(?<runId>\d+)\/cancel$/u,
		handle: (match) =>
			match.handlers.cancelWorkflowRun?.(group(match, "runId")),
	},
	{
		method: "GET",
		pattern: /^\/repos\/(?<owner>[^/]+)\/(?<name>[^/]+)$/u,
		handle: (match) =>
			match.handlers.getRepo?.(group(match, "owner"), group(match, "name")),
	},
	{
		method: "PATCH",
		pattern: /^\/repos\/(?<owner>[^/]+)\/(?<name>[^/]+)$/u,
		handle: (match) =>
			match.handlers.patchRepo?.(
				group(match, "owner"),
				group(match, "name"),
				match.body(),
			),
	},
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/contents\/(?<file>.+)$/u,
		handle: (match) =>
			match.handlers.getContents?.(
				group(match, "file"),
				match.url.searchParams.get("ref") ?? undefined,
			),
	},
	{
		method: "PUT",
		pattern: /^\/repos\/[^/]+\/[^/]+\/contents\/(?<file>.+)$/u,
		handle: (match) =>
			match.handlers.putContents?.(group(match, "file"), match.body()),
	},
	{
		method: "DELETE",
		pattern: /^\/repos\/[^/]+\/[^/]+\/contents\/(?<file>.+)$/u,
		handle: (match) =>
			match.handlers.deleteContents?.(group(match, "file"), match.body()),
	},
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/git\/ref\/(?<ref>.+)$/u,
		handle: (match) => match.handlers.getGitRef?.(group(match, "ref")),
	},
	{
		method: "POST",
		pattern: /^\/repos\/[^/]+\/[^/]+\/git\/refs$/u,
		handle: (match) => match.handlers.createGitRef?.(match.body()),
	},
	{
		method: "GET",
		pattern: /^\/repos\/[^/]+\/[^/]+\/pulls$/u,
		handle: (match) => match.handlers.listPulls?.(match.url.search),
	},
	{
		method: "POST",
		pattern: /^\/repos\/[^/]+\/[^/]+\/pulls$/u,
		handle: (match) => match.handlers.createPull?.(match.body()),
	},
];

function installGithubFetchMock(handlers: FetchMockHandlers): () => void {
	const previous = globalThis.fetch;

	const mockFetch = async (
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> => {
		await Promise.resolve();
		const url = requestUrl(input);
		if (!url.startsWith(GITHUB_API)) {
			throw new Error(`unexpected fetch host: ${url}`);
		}
		const parsed = new URL(url);
		const method = (init?.method ?? "GET").toUpperCase();

		for (const route of ROUTES) {
			if (route.method !== method) {
				continue;
			}
			const matched = route.pattern.exec(parsed.pathname);
			if (matched === null) {
				continue;
			}
			const mock = route.handle({
				body: () => parseBody(init),
				groups: matched.groups ?? {},
				handlers,
				url: parsed,
			});
			if (mock !== undefined) {
				return respond(mock);
			}
		}

		throw new Error(`unexpected GitHub fetch: ${method} ${parsed.pathname}`);
	};

	globalThis.fetch = asFetch(mockFetch);

	return () => {
		globalThis.fetch = previous;
	};
}

export type { FetchMockHandlers, MockResponse };
export { installGithubFetchMock };
