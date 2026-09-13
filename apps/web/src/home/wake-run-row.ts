import { parseSelect, wakeSupersedeSelect } from "@hakasebot/core/db/zod.ts";
import { d1Present } from "@hakasebot/core/vault/store.ts";
import { dispatchId, runUrl } from "@hakasebot/core/wake/domain.ts";
import type { DispatchId, RunUrl } from "@hakasebot/core/wake/domain.ts";

export interface SupersededWakeRow {
	createdAt: number;
	dispatchId: DispatchId;
	runUrl: RunUrl | undefined;
}

export function parseSupersededWake(
	row: unknown,
): SupersededWakeRow | undefined {
	const selected = parseSelect(
		wakeSupersedeSelect,
		row,
		"wake run row is invalid",
	);
	if (selected.kind === "invalid") {
		return;
	}
	const parsedDispatchId = dispatchId(selected.value.dispatchId);
	if (parsedDispatchId.kind === "invalid") {
		return;
	}
	let parsedRunUrl: RunUrl | undefined;
	if (d1Present(selected.value.runUrl)) {
		const parsed = runUrl(selected.value.runUrl);
		if (parsed.kind === "invalid") {
			return;
		}
		parsedRunUrl = parsed.value;
	}
	return {
		createdAt: selected.value.createdAt,
		dispatchId: parsedDispatchId.value,
		runUrl: parsedRunUrl,
	};
}
