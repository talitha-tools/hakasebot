import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	confirmRotate,
	parseConfirmRotateInput,
	previewRotate,
	rotateVault,
} from "./rotate.server.ts";

export const previewRotateFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const preview = await previewRotate({ cookieHeader });
		if (preview.kind === "invalid") {
			throw new Error(preview.message);
		}
		return preview.value;
	},
);

export const confirmRotateFn = createServerFn({ method: "POST" })
	.validator((input: { repos: string[] }) => {
		const parsed = parseConfirmRotateInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repos: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const confirmed = await confirmRotate({
			cookieHeader,
			repos: data.repos,
		});
		if (confirmed.kind === "invalid") {
			throw new Error(confirmed.message);
		}
	});

export const rotateVaultFn = createServerFn({ method: "POST" })
	.validator((input: { repos: string[] }) => {
		const parsed = parseConfirmRotateInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repos: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const rotated = await rotateVault({
			cookieHeader,
			repos: data.repos,
		});
		if (rotated.kind === "invalid") {
			throw new Error(rotated.message);
		}
		return rotated.value;
	});
