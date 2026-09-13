import { generateKeyPairSync } from "node:crypto";

import { githubAppPrivateKey } from "@hakasebot/core/domain.ts";

import { must } from "./job.ts";

const exported = generateKeyPairSync("rsa", {
	modulusLength: 2048,
}).privateKey.export({ format: "pem", type: "pkcs1" });

export const TEST_APP_PRIVATE_KEY = must(
	githubAppPrivateKey(
		typeof exported === "string" ? exported : exported.toString(),
	),
);
