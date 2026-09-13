import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { createD1VaultStore } from "#/vault/store.ts";

test("store writes and clears repo review instructions", async () => {
	const repo = testRepoRef("talitha-tools/demo", "900001");
	const store = createD1VaultStore(memoryD1());
	const enabled = await store.enableRepo({ githubUserId: "42", repo });
	expect(enabled.kind).toBe("ok");
	const saved = await store.setRepoReviewInstructions({
		githubUserId: "42",
		ignorePaths: [" CHANGELOG.md ", "docs/generated/**"],
		prompt: " Focus on correctness. ",
		repo,
	});
	expect(saved).toEqual({
		kind: "ok",
		value: {
			homeAt: undefined,
			ignorePaths: ["CHANGELOG.md", "docs/generated/**"],
			lastSyncedAt: undefined,
			botAt: undefined,
			prompt: "Focus on correctness.",
			repo,
			syncedEpoch: 0,
			wakeMode: "auto",
			autoAuthors: { scope: "you", skipLogins: [] },
			autoReviewCadence: "every-push",
			autoBranches: { branches: [], scope: "default", skipBranches: [] },
		},
	});

	const cleared = await store.setRepoReviewInstructions({
		githubUserId: "42",
		ignorePaths: [],
		prompt: " ",
		repo,
	});
	expect(cleared.kind).toBe("ok");
	if (cleared.kind === "ok") {
		expect(cleared.value.prompt).toBeUndefined();
		expect(cleared.value.ignorePaths).toBeUndefined();
	}
});
