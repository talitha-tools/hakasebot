import type { EngineConfig, Plan } from "@hakasebot/core/domain.ts";

export interface EngineJobCtx {
	homeDir: string;
	plan: Plan;
}

export type EngineOf<K extends EngineConfig["kind"]> = Extract<
	EngineConfig,
	{ kind: K }
>;

export function writesWorkspace(plan: Plan): boolean {
	return plan.kind === "mention" || plan.kind === "fix";
}
