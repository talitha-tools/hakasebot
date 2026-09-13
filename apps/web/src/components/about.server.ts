import type { TriggerPhrase } from "@hakasebot/core/domain.ts";

import { readMentionTrigger } from "#/env.ts";

export function readAboutPage(): { trigger: TriggerPhrase | undefined } {
	return { trigger: readMentionTrigger() };
}
