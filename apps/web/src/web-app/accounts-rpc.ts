import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	deleteVaultAccount,
	listVaultAccounts,
	parseDeleteAccountInput,
	parseSaveSealedAccountInput,
	saveVaultAccount,
} from "./accounts.server.ts";

export const listVaultAccountsFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const accounts = await listVaultAccounts({ cookieHeader });
		if (accounts.kind === "invalid") {
			throw new Error(accounts.message);
		}
		return accounts.value;
	},
);

export const saveVaultAccountFn = createServerFn({ method: "POST" })
	.validator(
		(input: {
			engine: string;
			label: string;
			sealed: {
				accountId: string;
				ciphertext: string;
				iv: string;
			};
		}) => {
			const parsed = parseSaveSealedAccountInput(input);
			if (parsed.kind === "invalid") {
				throw new Error(parsed.message);
			}
			return parsed.value;
		},
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const saved = await saveVaultAccount({
			cookieHeader,
			input: data,
		});
		if (saved.kind === "invalid") {
			throw new Error(saved.message);
		}
		return saved.value;
	});

export const deleteVaultAccountFn = createServerFn({ method: "POST" })
	.validator((input: { id: string }) => {
		const parsed = parseDeleteAccountInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { id: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const deleted = await deleteVaultAccount({
			cookieHeader,
			id: data.id,
		});
		if (deleted.kind === "invalid") {
			throw new Error(deleted.message);
		}
	});
