import {
	SECRET_NAMES,
	actionRef,
	githubAppSlug,
	mentionTrigger,
} from "@hakasebot/core/domain.ts";
import { VAULT_SECRET_NAMES } from "@hakasebot/core/vault/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { printHomeDispatcherYaml } from "#/home/dispatcher-yaml.ts";

test("home dispatcher yaml wires encryption key and app secrets", () => {
	const trigger = mentionTrigger(must(githubAppSlug("fork-bot")));
	const yaml = printHomeDispatcherYaml({
		actionRef: must(actionRef("talitha-tools/demo@v1")),
		labUrl: "https://lab.example",
		trigger,
	});
	expect(yaml).toContain("workflow_dispatch");
	expect(yaml).toContain('lab_url: "https://lab.example"');
	expect(yaml).toContain('trigger_phrase: "@fork-bot"');
	expect(yaml).toContain(`secrets.${SECRET_NAMES.githubAppId}`);
	expect(yaml).toContain(`secrets.${SECRET_NAMES.githubAppPrivateKey}`);
	expect(yaml).toContain(`secrets.${VAULT_SECRET_NAMES.encryptionKey}`);
	expect(yaml).not.toContain("credential_vault:");
	expect(yaml).not.toContain("model_queue:");
	expect(yaml).not.toContain("target_token");
});

test("home dispatcher yaml omits trigger_phrase when the hosted slug is unset", () => {
	const yaml = printHomeDispatcherYaml({
		actionRef: must(actionRef("talitha-tools/demo@v1")),
		labUrl: "https://lab.example",
		trigger: undefined,
	});
	expect(yaml).not.toContain("trigger_phrase");
	expect(yaml).not.toContain("@hakasebot");
});
