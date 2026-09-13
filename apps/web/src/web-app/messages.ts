import type { RepoRef } from "@hakasebot/core/domain.ts";

export type InstallStage = "bot" | "secret_sync";

export type RepoInstallState =
	| { kind: "idle" }
	| { kind: "running"; repo: RepoRef; stage: InstallStage }
	| { kind: "done"; repo: RepoRef }
	| { kind: "failed"; repo: RepoRef; stage: InstallStage; message: string };

export type RepoInstallCommand =
	| { kind: "begin_install"; repo: RepoRef }
	| { kind: "begin_resync"; repo: RepoRef }
	| { kind: "retry" }
	| { kind: "cancel" };

export type RepoInstallEvent =
	| { kind: "stage_ok"; stage: InstallStage }
	| { kind: "stage_failed"; stage: InstallStage; message: string };

export type RepoInstallEffect =
	| { kind: "run_bot"; repo: RepoRef }
	| { kind: "run_secret_sync"; repo: RepoRef };

export type RepoInstallReduce =
	| {
			kind: "ok";
			state: RepoInstallState;
			effects: readonly RepoInstallEffect[];
	  }
	| { kind: "rejected"; reason: string };
