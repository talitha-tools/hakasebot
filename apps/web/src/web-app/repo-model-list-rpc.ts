import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	clearRepoModelList,
	listRepoModelSlots,
	parseRepoIdInput,
	parseSetRepoModelListInput,
	setRepoModelList,
} from "./repos.server.ts";

export const listRepoModelSlotsFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string }) => {
		const parsed = parseRepoIdInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repoId: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const slots = await listRepoModelSlots({
			cookieHeader,
			repoId: data.repoId,
		});
		if (slots.kind === "invalid") {
			throw new Error(slots.message);
		}
		return slots.value;
	});

export const setRepoModelListFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string; orderedSlotIds: string[] }) => {
		const parsed = parseSetRepoModelListInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return parsed.value;
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const slots = await setRepoModelList({
			cookieHeader,
			orderedSlotIds: data.orderedSlotIds,
			repoId: data.repoId,
		});
		if (slots.kind === "invalid") {
			throw new Error(slots.message);
		}
		return slots.value;
	});

export const clearRepoModelListFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string }) => {
		const parsed = parseRepoIdInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repoId: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const slots = await clearRepoModelList({
			cookieHeader,
			repoId: data.repoId,
		});
		if (slots.kind === "invalid") {
			throw new Error(slots.message);
		}
		return slots.value;
	});
