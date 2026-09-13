import { SECRET_NAMES, workflowYaml } from "@hakasebot/core/domain.ts";
import type {
	ActionRef,
	TriggerPhrase,
	WorkflowYaml,
} from "@hakasebot/core/domain.ts";
import { VAULT_SECRET_NAMES } from "@hakasebot/core/vault/domain.ts";

const DISPATCH_INPUTS = [
	{ name: "target_repo", required: true },
	{ name: "consumer_repo_id", required: true },
	{ name: "pull_number", required: true },
	{ name: "head_sha", required: true },
	{ name: "installation_id", required: true },
	{ name: "dispatch_id", required: true },
	{ name: "plan", required: true },
	{ name: "comment_id", required: false },
	{ name: "progress_comment_id", required: false },
	{ name: "route_generation", required: false },
] as const;

function yamlString(value: string): string {
	return JSON.stringify(value);
}

function inputLines(): string[] {
	return DISPATCH_INPUTS.flatMap(({ name, required }) => [
		`      ${name}:`,
		`        required: ${required}`,
		"        type: string",
	]);
}

function stepLines(args: {
	actionRef: ActionRef;
	labUrl: string;
	trigger: TriggerPhrase | undefined;
}): string[] {
	const triggerLine =
		args.trigger === undefined
			? []
			: [`          trigger_phrase: ${yamlString(args.trigger)}`];
	return [
		"      - uses: actions/checkout@v4",
		`      - uses: ${yamlString(args.actionRef)}`,
		"        with:",
		...DISPATCH_INPUTS.map(
			({ name }) => `          ${name}: \${{ inputs.${name} }}`,
		),
		`          lab_url: ${yamlString(args.labUrl)}`,
		...triggerLine,
		`          github_app_id: \${{ secrets.${SECRET_NAMES.githubAppId} }}`,
		`          github_app_private_key: \${{ secrets.${SECRET_NAMES.githubAppPrivateKey} }}`,
		`          github_app_installation_id: \${{ inputs.installation_id }}`,
		`          encryption_key: \${{ secrets.${VAULT_SECRET_NAMES.encryptionKey} }}`,
	];
}

export function printHomeDispatcherYaml(args: {
	actionRef: ActionRef;
	labUrl: string;
	trigger: TriggerPhrase | undefined;
}): WorkflowYaml {
	const lines = [
		"name: home-review",
		`run-name: home-\${{ inputs.dispatch_id }}`,
		"on:",
		"  workflow_dispatch:",
		"    inputs:",
		...inputLines(),
		"permissions:",
		"  contents: read",
		"  pull-requests: write",
		"  issues: write",
		"concurrency:",
		`  group: home-\${{ inputs.target_repo }}-\${{ inputs.pull_number }}`,
		"  cancel-in-progress: true",
		"jobs:",
		"  review:",
		"    runs-on: ubuntu-latest",
		"    steps:",
		...stepLines(args),
		"",
	];
	return workflowYaml(lines.join("\n"));
}
