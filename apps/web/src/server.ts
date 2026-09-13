import handler from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "./paraglide/server.js";

const server = {
	async fetch(req: Request): Promise<Response> {
		return paraglideMiddleware(req, async () => handler.fetch(req));
	},
};

// oxlint-disable-next-line import/no-default-export -- TanStack Start server entry contract
export default server;
