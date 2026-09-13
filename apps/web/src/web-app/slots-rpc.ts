import { accountId } from "@hakasebot/core/vault/domain.ts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	deleteModelSlot,
	getVaultAccountSealed,
	listModelSlots,
	parseDeleteModelSlotInput,
	parseSaveModelSlotInput,
	parseSetDefaultSlotOrderInput,
	saveModelSlot,
	setDefaultModelSlotOrder,
} from "./slots.server.ts";

export const listModelSlotsFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const slots = await listModelSlots({ cookieHeader });
		if (slots.kind === "invalid") {
			throw new Error(slots.message);
		}
		return slots.value;
	},
);

export const saveModelSlotFn = createServerFn({ method: "POST" })
	.validator(
		(input: {
			accountId: string;
			engine: string;
			model: string;
			label: string;
			defaultSortIndex: number;
			effort?: string;
			fast?: boolean;
			similarModel?: boolean;
			slotId?: string;
		}) => {
			const parsed = parseSaveModelSlotInput(input);
			if (parsed.kind === "invalid") {
				throw new Error(parsed.message);
			}
			return parsed.value;
		},
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const saved = await saveModelSlot({
			cookieHeader,
			input: data,
		});
		if (saved.kind === "invalid") {
			throw new Error(saved.message);
		}
		return saved.value;
	});

export const deleteModelSlotFn = createServerFn({ method: "POST" })
	.validator((input: { id: string }) => {
		const parsed = parseDeleteModelSlotInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { id: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const deleted = await deleteModelSlot({
			cookieHeader,
			id: data.id,
		});
		if (deleted.kind === "invalid") {
			throw new Error(deleted.message);
		}
	});

export const setDefaultModelSlotOrderFn = createServerFn({ method: "POST" })
	.validator((input: { orderedSlotIds: string[] }) => {
		const parsed = parseSetDefaultSlotOrderInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { orderedSlotIds: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const ordered = await setDefaultModelSlotOrder({
			cookieHeader,
			orderedSlotIds: data.orderedSlotIds,
		});
		if (ordered.kind === "invalid") {
			throw new Error(ordered.message);
		}
		return ordered.value;
	});

export const getVaultAccountSealedFn = createServerFn({ method: "POST" })
	.validator((input: { id: string }) => {
		const parsed = accountId(input.id);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { id: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const row = await getVaultAccountSealed({
			cookieHeader,
			id: data.id,
		});
		if (row.kind === "invalid") {
			throw new Error(row.message);
		}
		return row.value;
	});
