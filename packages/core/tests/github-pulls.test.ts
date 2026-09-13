import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import { githubToken, pullNumber, reviewId } from "#/domain.ts";
import { listPullReviews } from "#/github-api.server.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function reviewJson(id: number) {
	return {
		body: `r${String(id)}`,
		commit_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		id,
		state: "COMMENTED",
		submitted_at: "2024-01-01T00:00:00Z",
	};
}

function parsedReview(id: number) {
	return {
		body: `r${String(id)}`,
		commitId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		id: must(reviewId(id)),
		state: "COMMENTED",
		submittedAt: Date.parse("2024-01-01T00:00:00Z"),
	};
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

function installReviewPages(pages: Record<string, unknown>): {
	requested: { page: string; perPage: string | null }[];
} {
	const requested: { page: string; perPage: string | null }[] = [];
	const previous = globalThis.fetch;
	globalThis.fetch = asFetch((input) => {
		const url = new URL(requestUrl(input));
		expect(url.pathname).toBe("/repos/acme/lab/pulls/7/reviews");
		const page = url.searchParams.get("page") ?? "1";
		requested.push({
			page,
			perPage: url.searchParams.get("per_page"),
		});
		const json = pages[page];
		if (json === undefined) {
			throw new Error(`unexpected reviews page ${page}`);
		}
		return Response.json(json);
	});
	restoreFetch = () => {
		globalThis.fetch = previous;
	};
	return { requested };
}

test("listPullReviews paginates a full page plus remainder", async () => {
	const { requested } = installReviewPages({
		"1": Array.from({ length: 100 }, (_slot, index) => reviewJson(index + 1)),
		"2": [reviewJson(101)],
	});
	const listed = await listPullReviews({
		pullNumber: must(pullNumber(7)),
		repo: testRepoRef("acme/lab", "880001"),
		token: must(githubToken("ghs_test")),
	});
	expect(listed.kind).toBe("ok");
	if (listed.kind !== "ok") {
		return;
	}
	expect(requested).toEqual([
		{ page: "1", perPage: "100" },
		{ page: "2", perPage: "100" },
	]);
	expect(listed.value).toHaveLength(101);
	expect(listed.value[0]).toEqual(parsedReview(1));
	expect(listed.value[100]).toEqual(parsedReview(101));
});

test("listPullReviews stops on an empty first page", async () => {
	const { requested } = installReviewPages({ "1": [] });
	const listed = await listPullReviews({
		pullNumber: must(pullNumber(7)),
		repo: testRepoRef("acme/lab", "880001"),
		token: must(githubToken("ghs_test")),
	});
	expect(listed).toEqual({ kind: "ok", value: [] });
	expect(requested).toEqual([{ page: "1", perPage: "100" }]);
});

test("listPullReviews does not fetch a second page when the first is short", async () => {
	const { requested } = installReviewPages({
		"1": [reviewJson(1), reviewJson(2)],
	});
	const listed = await listPullReviews({
		pullNumber: must(pullNumber(7)),
		repo: testRepoRef("acme/lab", "880001"),
		token: must(githubToken("ghs_test")),
	});
	expect(listed).toEqual({
		kind: "ok",
		value: [parsedReview(1), parsedReview(2)],
	});
	expect(requested).toEqual([{ page: "1", perPage: "100" }]);
});
