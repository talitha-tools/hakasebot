import { setFailed } from "@actions/core";
import { actionExitCode } from "@hakasebot/core/review.server.ts";

import { processEnv } from "./action-env.ts";
import { parseHomeRunInputs } from "./home/run-inputs.ts";
import { runHomeReview } from "./home/run-review.ts";

const homeInputs = parseHomeRunInputs({ env: processEnv });
if (homeInputs.kind === "invalid") {
	setFailed(homeInputs.message);
	// oxlint-disable-next-line unicorn/no-process-exit -- CLI entrypoint reports the outcome via exit code
	process.exit(1);
}

const workspace = processEnv["GITHUB_WORKSPACE"] ?? process.cwd();
// oxlint-disable-next-line node/no-top-level-await -- CLI entrypoint module, never loaded via require()
const result = await runHomeReview({
	consumerDir: `${workspace}/__consumer`,
	env: processEnv,
	inputs: homeInputs.value,
});
// oxlint-disable-next-line unicorn/no-process-exit -- CLI entrypoint reports the outcome via exit code
process.exit(
	actionExitCode({
		failOnFindings: false,
		result,
	}),
);
