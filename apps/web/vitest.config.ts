import { testKitPreload } from "@hakasebot/test-kit/vitest-project.ts";

const webTestProject = {
	test: {
		env: {
			VITEST: "true",
			VITE_LAB_URL: "http://localhost:47821",
		},
		include: ["tests/**/*.test.ts"],
		setupFiles: [testKitPreload],
	},
};

export default webTestProject;
