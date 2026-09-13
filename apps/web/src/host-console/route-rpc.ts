import { createServerFn } from "@tanstack/react-start";

import { ensureHostConsoleRoute } from "./route.server.ts";

export const ensureHostConsoleRouteFn = createServerFn({
	method: "GET",
}).handler(() => {
	ensureHostConsoleRoute();
});
