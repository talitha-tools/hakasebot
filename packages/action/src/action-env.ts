/**
 * Sole process.env boundary for the Action runtime (node/no-process-env).
 * Read single vars through envValue; pass processEnv where a whole env
 * record is required (spawned children, env-record parameters).
 */
// oxlint-disable-next-line node/no-process-env -- sole typed env boundary for the Action runtime
export const processEnv = process.env;

/** Env var value, treating empty strings as unset. */
export function envValue(name: string): string | undefined {
	const value = processEnv[name];
	return value !== undefined && value.length > 0 ? value : undefined;
}

/** Checkout root for engine passes: Actions workspace, then invoking cwd. */
export function workspaceRoot(): string {
	return (
		processEnv["GITHUB_WORKSPACE"] ?? processEnv["INIT_CWD"] ?? process.cwd()
	);
}

/** Point engine passes at the freshly cloned consumer checkout. */
export function setGithubWorkspace(dir: string): void {
	processEnv["GITHUB_WORKSPACE"] = dir;
}
