import { mkdir } from "node:fs/promises";
import path from "node:path";

import type { JobHome } from "#/job-home.ts";

export async function writeAuthJson(args: {
	home: JobHome;
	dirname: string;
	credential: string;
}): Promise<void> {
	const dir = path.join(args.home.root, args.dirname);
	await mkdir(dir, { recursive: true });
	await Bun.write(path.join(dir, "auth.json"), args.credential);
}
