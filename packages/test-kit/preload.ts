import { afterEach } from "vitest";

import { installBunPolyfill } from "./bun-polyfill.ts";

Reflect.set(import.meta.env, "VITEST", true);
installBunPolyfill();

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});
