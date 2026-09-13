import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export const testKitPreload = fileURLToPath(
	new URL("preload.ts", import.meta.url),
);

/**
 * Shared per-package vitest project config. setupFiles resolves against this
 * file, so consumers need no ../../ path back to test-kit.
 */
export const testProject = defineConfig({
	test: {
		env: {
			VITEST: "true",
		},
		include: ["tests/**/*.test.ts"],
		setupFiles: [testKitPreload],
	},
});
