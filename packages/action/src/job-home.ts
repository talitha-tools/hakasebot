import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { absolutePath } from "@hakasebot/core/domain.ts";
import type { AbsolutePath } from "@hakasebot/core/domain.ts";

/** Throwaway HOME for one engine pass; credentials live and die here. */
export interface JobHome {
	root: AbsolutePath;
}

export async function createJobHome(): Promise<JobHome> {
	const dir = await mkdtemp(path.join(tmpdir(), "hakasebot-home-"));
	const parsed = absolutePath(dir);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return { root: parsed.value };
}

export async function destroyJobHome(home: JobHome): Promise<void> {
	await rm(home.root, { recursive: true, force: true });
}
