import { defineConfig } from "oxlint";

// Boundaries are structural (see docs/adr/0029): the TanStack Start
// import-protection plugin denies *.server.* imports in the client build and
// *.client.* imports in the SSR build, @hakasebot/action exports nothing, and the
// web/core tsconfigs do not load Bun globals.
export default defineConfig({
	categories: {
		correctness: "error",
		pedantic: "error",
		perf: "error",
		restriction: "error",
		style: "error",
		suspicious: "error",
	},
	env: {
		builtin: true,
	},
	globals: {},
	ignorePatterns: [
		"apps/web/src/routeTree.gen.ts",
		"apps/web/src/paraglide/**",
		"apps/web/worker-configuration.d.ts",
	],
	options: {
		reportUnusedDisableDirectives: "error",
		typeAware: true,
		typeCheck: true,
	},
	overrides: [
		{
			files: ["**/*.config.{js,ts}"],
			rules: {
				"import/no-default-export": "off",
				"import/prefer-default-export": ["error", { target: "any" }],
			},
		},
		{
			// Tests run under vitest on node: builtins, env vars, and sync IO are
			// the harness, and fixtures stay long.
			files: [
				"apps/web/tests/**",
				"packages/*/tests/**",
				"packages/test-kit/**",
			],
			rules: {
				"eslint/max-lines": "off",
				"eslint/max-lines-per-function": "off",
				"import/no-nodejs-modules": "off",
				"node/no-process-env": "off",
				"node/no-sync": "off",
			},
		},
		{
			// The Action runs on Bun, where node builtins are native.
			files: ["packages/action/src/**"],
			rules: {
				"import/no-nodejs-modules": "off",
			},
		},
	],
	plugins: [
		"eslint",
		"import",
		"jsx-a11y",
		"node",
		"oxc",
		"promise",
		"react",
		"react-perf",
		"typescript",
		"unicorn",
	],
	rules: {
		"eslint/array-callback-return": ["error", { allowImplicit: true }],
		"eslint/capitalized-comments": "off",
		"eslint/default-case": "off",
		"eslint/func-style": "off",
		"eslint/id-length": [
			"error",
			{
				checkGeneric: false,
				properties: "never",
			},
		],
		"eslint/init-declarations": "off",
		"eslint/max-lines": [
			"warn",
			{
				skipBlankLines: true,
				skipComments: true,
			},
		],
		"eslint/max-lines-per-function": [
			"warn",
			{
				skipBlankLines: true,
				skipComments: true,
			},
		],
		"eslint/max-params": "off",
		"eslint/max-statements": "off",
		"eslint/no-console": "off",
		"eslint/no-continue": "off",
		"eslint/no-duplicate-imports": [
			"error",
			{
				allowSeparateTypeImports: true,
			},
		],
		"eslint/no-inline-comments": "off",
		"eslint/no-magic-numbers": "off",
		"eslint/no-ternary": "off",
		"eslint/no-undefined": "off",
		"eslint/no-useless-return": ["off"],
		"eslint/no-void": ["error", { allowAsStatement: true }],
		"eslint/one-var": "off",
		"eslint/require-await": "off",
		"eslint/sort-imports": "off",
		"eslint/sort-keys": "off",
		"import/exports-last": "off",
		"import/group-exports": "off",
		"import/max-dependencies": ["warn", { ignoreTypeImports: true, max: 20 }],
		"import/no-default-export": "error",
		"import/no-named-export": "off",
		"import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
		"import/prefer-default-export": "off",
		"node/no-process-env": "error",
		"oxc/no-async-await": "off",
		"oxc/no-optional-chaining": "off",
		"oxc/no-rest-spread-properties": "off",
		"react/forbid-component-props": "off",
		"react/jsx-filename-extension": [
			"error",
			{
				extensions: ["jsx", "tsx"],
			},
		],
		"react/jsx-max-depth": "off",
		"react/jsx-no-literals": "off",
		"react/jsx-props-no-spreading": "off",
		"react/no-multi-comp": "off",
		"react/only-export-components": [
			"error",
			{ allowExportNames: ["Route", "ServerRoute"] },
		],
		"react/react-in-jsx-scope": "off",
		// The React Compiler memoizes props; fresh-object-per-render rules
		// police a problem it already solves.
		"react-perf/jsx-no-new-array-as-prop": "off",
		"react-perf/jsx-no-new-function-as-prop": "off",
		"react-perf/jsx-no-new-object-as-prop": "off",
		"typescript/consistent-return": "off",
		"typescript/explicit-function-return-type": "off",
		"typescript/explicit-module-boundary-types": "off",
		"typescript/prefer-readonly-parameter-types": "off",
		"typescript/strict-boolean-expressions": "off",
		"unicorn/no-useless-undefined": ["error", { checkArguments: false }],
		"unicorn/number-literal-case": "off",
	},
});
