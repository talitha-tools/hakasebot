import { expect, test } from "vitest";

import { homeRunUrlFromEnv } from "#/home/run-url.ts";

test("homeRunUrlFromEnv builds the actions run url", () => {
	expect(
		homeRunUrlFromEnv({
			GITHUB_REPOSITORY: "talitha-tools/review-home",
			GITHUB_RUN_ID: "99",
			GITHUB_SERVER_URL: "https://github.com",
		}),
	).toBe("https://github.com/talitha-tools/review-home/actions/runs/99");
});

test("homeRunUrlFromEnv is missing without run id", () => {
	expect(
		homeRunUrlFromEnv({
			GITHUB_REPOSITORY: "talitha-tools/review-home",
			GITHUB_SERVER_URL: "https://github.com",
		}),
	).toBeUndefined();
});
