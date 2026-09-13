import type { RepoRef } from "@hakasebot/core/domain.ts";

import type { EnabledRepo, InstallStep } from "./domain.ts";
import type {
	InstallStage,
	RepoInstallCommand,
	RepoInstallEffect,
	RepoInstallEvent,
	RepoInstallReduce,
	RepoInstallState,
} from "./messages.ts";

export function machineStageToInstallStep(stage: InstallStage): InstallStep {
	switch (stage) {
		case "bot": {
			return "bot";
		}
		case "secret_sync": {
			return "sync";
		}
	}
}

export function repoNeedsResync(
	repo: Pick<EnabledRepo, "syncedEpoch">,
	epoch: number,
): boolean {
	return repo.syncedEpoch < epoch;
}

function nextStage(stage: InstallStage): InstallStage | "done" {
	switch (stage) {
		case "bot": {
			return "secret_sync";
		}
		case "secret_sync": {
			return "done";
		}
	}
}

function stageEffect(stage: InstallStage, repo: RepoRef): RepoInstallEffect {
	switch (stage) {
		case "bot": {
			return { kind: "run_bot", repo };
		}
		case "secret_sync": {
			return { kind: "run_secret_sync", repo };
		}
	}
}

function startStage(repo: RepoRef, stage: InstallStage): RepoInstallReduce {
	return {
		effects: [stageEffect(stage, repo)],
		kind: "ok",
		state: { kind: "running", repo, stage },
	};
}

export function initialInstallStage(
	row: Pick<EnabledRepo, "botAt">,
): InstallStage {
	if (row.botAt === undefined) {
		return "bot";
	}
	return "secret_sync";
}

export function reduceRepoInstall(args: {
	command: RepoInstallCommand;
	state: RepoInstallState;
	row?: EnabledRepo | undefined;
}): RepoInstallReduce {
	const { command, row, state } = args;

	if (command.kind === "cancel") {
		return { effects: [], kind: "ok", state: { kind: "idle" } };
	}

	if (command.kind === "begin_install") {
		return startStage(
			command.repo,
			initialInstallStage(row ?? { botAt: undefined }),
		);
	}

	if (command.kind === "begin_resync") {
		if (row === undefined) {
			return {
				kind: "rejected",
				reason: "enabled repo row is missing",
			};
		}
		if (row.botAt === undefined) {
			return {
				kind: "rejected",
				reason: "repo is not provisioned for re-sync",
			};
		}
		return startStage(command.repo, "secret_sync");
	}

	if (command.kind === "retry") {
		if (state.kind !== "failed") {
			return {
				kind: "rejected",
				reason: "install is not in a failed state",
			};
		}
		return startStage(state.repo, state.stage);
	}

	return { kind: "rejected", reason: "unhandled install command" };
}

export function applyRepoInstallEvent(args: {
	event: RepoInstallEvent;
	state: RepoInstallState;
}): RepoInstallReduce {
	const { event, state } = args;
	if (state.kind !== "running") {
		return {
			kind: "rejected",
			reason: "install event outside a running stage",
		};
	}
	if (event.stage !== state.stage) {
		return {
			kind: "rejected",
			reason: "install event stage mismatch",
		};
	}

	if (event.kind === "stage_failed") {
		return {
			effects: [],
			kind: "ok",
			state: {
				kind: "failed",
				message: event.message,
				repo: state.repo,
				stage: event.stage,
			},
		};
	}

	const advanced = nextStage(state.stage);
	if (advanced === "done") {
		return {
			effects: [],
			kind: "ok",
			state: { kind: "done", repo: state.repo },
		};
	}
	return startStage(state.repo, advanced);
}
