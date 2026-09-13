import { defineConfig } from "oxfmt";

export default defineConfig({
	ignorePatterns: ["routeTree.gen.ts"],
	sortImports: true,
	sortPackageJson: {
		sortScripts: true,
	},
	sortTailwindcss: {
		functions: ["tv"],
	},
});
