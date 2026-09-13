import { createServerFn } from "@tanstack/react-start";

import { readAboutPage } from "./about.server.ts";

export const readAboutPageFn = createServerFn({ method: "GET" }).handler(() =>
	readAboutPage(),
);
