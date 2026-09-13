import { expect, test } from "vitest";

import { parseRepoRef, repoName } from "#/domain.ts";

test("repoName rejects . and ..", () => {
	expect(repoName(".")).toEqual({
		kind: "invalid",
		message: "invalid repository name",
	});
	expect(repoName("..")).toEqual({
		kind: "invalid",
		message: "invalid repository name",
	});
});

test("repoName still accepts dotted names that are not . or ..", () => {
	expect(repoName(".github").kind).toBe("ok");
	expect(repoName("hakasebot").kind).toBe("ok");
});

test("parseRepoRef rejects owner/..", () => {
	expect(parseRepoRef("acme/..")).toEqual({
		kind: "invalid",
		message: "invalid repository name",
	});
});
