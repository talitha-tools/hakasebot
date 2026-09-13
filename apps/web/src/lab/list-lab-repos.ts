import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { listReposForSession } from "./list-repos.server.ts";

export const listLabReposFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		return listReposForSession({ cookieHeader });
	},
);
