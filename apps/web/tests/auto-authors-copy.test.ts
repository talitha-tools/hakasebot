import { expect, test } from "vitest";

import {
	autoAuthorHint,
	autoAuthorLabel,
} from "#/web-app/views/auto-setting-copy.ts";

test("auto author labels are only you, friends, and everyone", () => {
	expect(autoAuthorLabel("you")).toBe("only you");
	expect(autoAuthorLabel("friends")).toBe("friends");
	expect(autoAuthorLabel("everyone")).toBe("everyone");
	expect(autoAuthorHint("you")).toContain("only your pull requests");
	expect(autoAuthorHint("friends")).toContain("already have the repo");
	expect(autoAuthorHint("everyone")).toContain("every human");
});
