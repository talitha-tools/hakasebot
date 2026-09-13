import type { RepoRef } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

import { m as msg } from "#/paraglide/messages.js";

import type { EnabledRepo, InstallStep } from "./domain.ts";
import {
	applyRepoInstallEvent,
	machineStageToInstallStep,
	reduceRepoInstall,
} from "./machine.ts";
import type {
	InstallStage,
	RepoInstallEvent,
	RepoInstallReduce,
	RepoInstallState,
} from "./messages.ts";
import {
	completeBot,
	pushRepoVaultSecretsFromBrowser,
} from "./repo-install.ts";

interface StageContext {
	applyStageOk: (stage: InstallStage) => void;
	failStage: (stage: InstallStage, message: string) => void;
	githubUserId: string | undefined;
	onFinished: (() => void) | undefined;
	onStageChange: ((repo: RepoRef, install: InstallStep) => void) | undefined;
}

function applyEvent(
	state: RepoInstallState,
	event: RepoInstallEvent,
): RepoInstallState {
	const applied = applyRepoInstallEvent({ event, state });
	return applied.kind === "ok" ? applied.state : state;
}

async function pushVaultStage(ctx: StageContext, repo: RepoRef) {
	if (ctx.githubUserId === undefined) {
		ctx.failStage("secret_sync", msg.lab_not_loaded());
		return;
	}
	ctx.onStageChange?.(repo, "sync");
	const synced = await pushRepoVaultSecretsFromBrowser({
		githubUserId: ctx.githubUserId,
		repo,
	});
	if (synced.kind === "invalid") {
		throw new Error(synced.message);
	}
	ctx.applyStageOk("secret_sync");
	ctx.onFinished?.();
}

async function runSyncStage(ctx: StageContext, repo: RepoRef) {
	try {
		await pushVaultStage(ctx, repo);
	} catch (error: unknown) {
		const message = errorMessage(error, msg.install_failed());
		ctx.failStage("secret_sync", message);
	}
}

async function runBotStage(ctx: StageContext, repo: RepoRef): Promise<boolean> {
	try {
		await completeBot({ repo });
		ctx.applyStageOk("bot");
		return true;
	} catch (error: unknown) {
		const message = errorMessage(error, msg.install_bot_failed());
		ctx.failStage("bot", message);
		return false;
	}
}

async function runStages(
	ctx: StageContext,
	repo: RepoRef,
	stage: InstallStage,
	announceBot: boolean,
) {
	if (stage === "bot") {
		if (announceBot) {
			ctx.onStageChange?.(repo, "bot");
		}
		if (await runBotStage(ctx, repo)) {
			await runSyncStage(ctx, repo);
		}
		return;
	}
	await runSyncStage(ctx, repo);
}

function useStageContext(args: {
	githubUserId: string | undefined;
	onFinished: (() => void) | undefined;
	onStageChange: ((repo: RepoRef, install: InstallStep) => void) | undefined;
	setInstallState: Dispatch<SetStateAction<RepoInstallState>>;
}): StageContext {
	const { githubUserId, onFinished, onStageChange, setInstallState } = args;
	return useMemo(
		() => ({
			applyStageOk: (stage) => {
				setInstallState((current) =>
					applyEvent(current, { kind: "stage_ok", stage }),
				);
			},
			failStage: (stage, message) => {
				setInstallState((current) =>
					current.kind === "running"
						? applyEvent(current, { kind: "stage_failed", message, stage })
						: current,
				);
			},
			githubUserId,
			onFinished,
			onStageChange,
		}),
		[githubUserId, onFinished, onStageChange, setInstallState],
	);
}

type GuardedRun = (
	repo: RepoRef,
	stage: InstallStage,
	announceBot: boolean,
) => Promise<void>;

function useGuardedStageRun(
	ctx: StageContext,
	runningRef: RefObject<boolean>,
): GuardedRun {
	return useCallback(
		async (repo, stage, announceBot) => {
			if (runningRef.current) {
				return;
			}
			runningRef.current = true;
			await runStages(ctx, repo, stage, announceBot);
			runningRef.current = false;
		},
		[ctx, runningRef],
	);
}

interface CommandDeps {
	ctx: StageContext;
	run: GuardedRun;
	setInstallState: Dispatch<SetStateAction<RepoInstallState>>;
}

function dispatchReduced(deps: CommandDeps, reduced: RepoInstallReduce) {
	if (reduced.kind === "rejected") {
		return;
	}
	deps.setInstallState(reduced.state);
	if (reduced.state.kind === "running") {
		deps.ctx.onStageChange?.(
			reduced.state.repo,
			machineStageToInstallStep(reduced.state.stage),
		);
		void deps.run(reduced.state.repo, reduced.state.stage, true);
	}
}

type CommandState = CommandDeps & {
	installState: RepoInstallState;
	runningRef: RefObject<boolean>;
};

function useStartCommands(
	deps: CommandState & { enabledRepos: readonly EnabledRepo[] },
) {
	const { ctx, enabledRepos, installState, run, runningRef, setInstallState } =
		deps;

	const startInstall = useCallback(
		(
			repo: RepoRef,
			command: { kind: "begin_install" } | { kind: "begin_resync" },
		) => {
			if (runningRef.current) {
				return;
			}
			const row = enabledRepos.find((item) => item.repo.id === repo.id);
			dispatchReduced(
				{ ctx, run, setInstallState },
				reduceRepoInstall({
					command: { ...command, repo },
					row,
					state: installState,
				}),
			);
		},
		[ctx, enabledRepos, installState, run, runningRef, setInstallState],
	);

	return {
		beginInstall: useCallback(
			(repo: RepoRef) => {
				startInstall(repo, { kind: "begin_install" });
			},
			[startInstall],
		),
		beginResync: useCallback(
			(repo: RepoRef) => {
				startInstall(repo, { kind: "begin_resync" });
			},
			[startInstall],
		),
	};
}

function useRecoveryCommands(deps: CommandState) {
	const { ctx, installState, run, runningRef, setInstallState } = deps;

	const retry = useCallback(() => {
		if (runningRef.current) {
			return;
		}
		dispatchReduced(
			{ ctx, run, setInstallState },
			reduceRepoInstall({ command: { kind: "retry" }, state: installState }),
		);
	}, [ctx, installState, run, runningRef, setInstallState]);

	const cancel = useCallback(() => {
		const reduced = reduceRepoInstall({
			command: { kind: "cancel" },
			state: installState,
		});
		if (reduced.kind !== "rejected") {
			setInstallState(reduced.state);
		}
	}, [installState, setInstallState]);

	return { cancel, retry };
}

export function useRepoInstall(args: {
	githubUserId: string | undefined;
	enabledRepos: readonly EnabledRepo[];
	onStageChange?: (repo: RepoRef, install: InstallStep) => void;
	onFinished?: () => void;
}): {
	installState: RepoInstallState;
	beginInstall: (repo: RepoRef) => void;
	beginResync: (repo: RepoRef) => void;
	confirmBot: (repo: RepoRef) => Promise<void>;
	retry: () => void;
	cancel: () => void;
} {
	const [installState, setInstallState] = useState<RepoInstallState>({
		kind: "idle",
	});
	const runningRef = useRef(false);
	const ctx = useStageContext({
		githubUserId: args.githubUserId,
		onFinished: args.onFinished,
		onStageChange: args.onStageChange,
		setInstallState,
	});
	const run = useGuardedStageRun(ctx, runningRef);
	const commandState = { ctx, installState, run, runningRef, setInstallState };
	const starts = useStartCommands({
		...commandState,
		enabledRepos: args.enabledRepos,
	});
	const recovery = useRecoveryCommands(commandState);

	const confirmBot = useCallback(
		async (repo: RepoRef) => run(repo, "bot", false),
		[run],
	);

	return { ...starts, ...recovery, confirmBot, installState };
}
