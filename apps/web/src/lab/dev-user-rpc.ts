import { createServerFn } from "@tanstack/react-start";

import type { DevUserPublic } from "#/lib/dev-user.ts";
import { publicDevUser } from "#/lib/dev-user.ts";
import { loadDevUser } from "#/lib/user-session";

export const readDevUserPublicFn = createServerFn({
	method: "GET",
}).handler((): DevUserPublic => publicDevUser(loadDevUser()));
