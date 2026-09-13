import { engineKind } from "@hakasebot/core/domain.ts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { readWorkerModelCatalog } from "#/catalog-bindings.ts";

import { userGithubUserId } from "./accounts.server.ts";

export const getModelCatalogFn = createServerFn({ method: "POST" })
	.validator((input: { engine: string }) => {
		const parsed = engineKind(input.engine);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return parsed.value;
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const session = await userGithubUserId({ cookieHeader });
		if (session.kind === "invalid") {
			throw new Error(session.message);
		}
		const catalog = await readWorkerModelCatalog(data);
		if (catalog.kind === "invalid") {
			throw new Error(catalog.message);
		}
		return catalog.value;
	});
