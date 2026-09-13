import type { AppDb } from "@hakasebot/core/db/client.ts";
import { firstRow } from "@hakasebot/core/db/row.ts";
import { webhookReceipts } from "@hakasebot/core/db/schema.ts";
import { parseSelect, webhookReceiptSelect } from "@hakasebot/core/db/zod.ts";
import type { WakeOutcome } from "@hakasebot/core/wake/domain.ts";
import { eq } from "drizzle-orm";

export type WebhookReceiptOutcome = WakeOutcome["kind"];

export interface WebhookReceipt {
	eventName: string;
	outcome: WebhookReceiptOutcome;
	receivedAt: number;
}

function parseWebhookReceipt(row: unknown): WebhookReceipt {
	const parsed = parseSelect(
		webhookReceiptSelect,
		row,
		"webhook receipt outcome is invalid",
	);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

export async function readWebhookReceipt(
	db: AppDb,
): Promise<WebhookReceipt | undefined> {
	const rows = await db
		.select({
			eventName: webhookReceipts.eventName,
			outcome: webhookReceipts.outcome,
			receivedAt: webhookReceipts.receivedAt,
		})
		.from(webhookReceipts)
		.where(eq(webhookReceipts.id, 1))
		.limit(1);
	const row = firstRow(rows);
	if (row === undefined) {
		return undefined;
	}
	return parseWebhookReceipt(row);
}

export async function writeWebhookReceipt(
	db: AppDb,
	receipt: WebhookReceipt,
): Promise<void> {
	await db
		.insert(webhookReceipts)
		.values({
			eventName: receipt.eventName,
			id: 1,
			outcome: receipt.outcome,
			receivedAt: receipt.receivedAt,
		})
		.onConflictDoUpdate({
			set: {
				eventName: receipt.eventName,
				outcome: receipt.outcome,
				receivedAt: receipt.receivedAt,
			},
			target: webhookReceipts.id,
		});
}
