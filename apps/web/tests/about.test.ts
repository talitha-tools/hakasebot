import { readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

const src = path.join(import.meta.dirname, "..", "src", "components");

test("about route and rpc do not import server env", async () => {
	const route = await readFile(
		path.join(import.meta.dirname, "..", "src", "routes", "about.tsx"),
		"utf8",
	);
	const rpc = await readFile(path.join(src, "about-rpc.ts"), "utf8");
	expect(route).not.toContain("#/env");
	expect(rpc).not.toContain("#/env");
	expect(rpc).toContain("about.server.ts");
});
