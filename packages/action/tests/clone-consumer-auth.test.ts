import { githubToken } from "@hakasebot/core/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import {
	ASKPASS_SCRIPT,
	consumerRemoteUrl,
	gitAuthEnv,
} from "#/home/clone-consumer.ts";

const repo = testRepoRef("octo/consumer", "900301");
const TOKEN = "ghs_secretinstallationtoken";
const token = must(githubToken(TOKEN));

describe("consumerRemoteUrl", () => {
	test("is tokenless — no credential is embedded in the clone URL", () => {
		const url = consumerRemoteUrl(repo);
		// A token in the URL would persist into .git/config, readable by the
		// review engine. Credentials come from askpass instead.
		expect(url).toBe("https://github.com/octo/consumer.git");
		expect(url).not.toContain("@");
		expect(url).not.toContain(TOKEN);
	});
});

describe("gitAuthEnv", () => {
	test("routes credentials through askpass with the token only in the child env", () => {
		const askpath = "/tmp/hakasebot-abc/git-askpass.sh";
		const env = gitAuthEnv(token, askpath);

		expect(env["GIT_ASKPASS"]).toBe(askpath);
		expect(env["HAKASE_GIT_TOKEN"]).toBe(TOKEN);
		// Fail closed rather than blocking on an interactive credential prompt.
		expect(env["GIT_TERMINAL_PROMPT"]).toBe("0");

		// The token appears in no key, and in exactly one value — the child env
		// var askpass reads — never the argv, URL, or a config value.
		for (const [key, value] of Object.entries(env)) {
			expect(key).not.toContain(TOKEN);
			if (key !== "HAKASE_GIT_TOKEN") {
				expect(value).not.toContain(TOKEN);
			}
		}
	});
});

describe("ASKPASS_SCRIPT", () => {
	test("holds no secret — reads the token from the environment at prompt time", () => {
		expect(ASKPASS_SCRIPT).toContain("$HAKASE_GIT_TOKEN");
		expect(ASKPASS_SCRIPT).toContain("x-access-token");
		expect(ASKPASS_SCRIPT).not.toContain(TOKEN);
	});
});
