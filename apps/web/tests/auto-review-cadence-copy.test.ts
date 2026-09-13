import { expect, test } from "vitest";

import {
	autoReviewCadenceHint,
	autoReviewCadenceLabel,
} from "#/web-app/views/auto-setting-copy.ts";

test("auto review cadence labels are every push and once per pr", () => {
	expect(autoReviewCadenceLabel("every-push")).toBe("every push");
	expect(autoReviewCadenceLabel("once-per-pr")).toBe("once per pr");
	expect(autoReviewCadenceHint("every-push")).toContain("push more");
	expect(autoReviewCadenceHint("once-per-pr")).toContain("flopped");
});
