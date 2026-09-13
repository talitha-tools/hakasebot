import type { Config } from "stylelint";

export default {
	extends: [
		"stylelint-config-recommended",
		"stylelint-config-clean-order",
		"@dreamsicle.io/stylelint-config-tailwindcss",
	],
	ignoreFiles: ["!apps/web/src/**/*.css"],
	rules: {
		"at-rule-no-unknown": [
			true,
			{
				ignoreAtRules: [
					"theme",
					"plugin",
					"source",
					"utility",
					"variant",
					"custom-variant",
					"apply",
				],
			},
		],
		// stylelint uses null to turn a rule off
		// oxlint-disable-next-line unicorn/no-null -- stylelint API
		"no-descending-specificity": null,
	},
} satisfies Config;
