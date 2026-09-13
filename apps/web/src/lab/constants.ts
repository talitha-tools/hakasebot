import type { EngineKind } from "@hakasebot/core/domain.ts";

import { m as msg } from "#/paraglide/messages.js";

export const ENGINE_OPTIONS = [
	{ kind: "claude", label: "claude" },
	{ kind: "codex", label: "codex" },
	{ kind: "grok", label: "grok" },
	{ kind: "cursor", label: "cursor" },
	{ kind: "antigravity", label: "antigravity" },
] as const satisfies readonly {
	kind: EngineKind;
	label: string;
}[];

export function engineLabel(kind: EngineKind): string {
	const option = ENGINE_OPTIONS.find((entry) => entry.kind === kind);
	if (option === undefined) {
		return kind;
	}
	return option.label;
}

const CREDENTIAL_FIELDS = {
	antigravity: {
		hint: msg.credential_hint_antigravity,
		label: msg.credential_label_antigravity,
	},
	claude: {
		hint: msg.credential_hint_claude,
		label: msg.credential_label_claude,
	},
	codex: {
		hint: msg.credential_hint_codex,
		label: msg.credential_label_codex,
	},
	cursor: {
		hint: msg.credential_hint_cursor,
		label: msg.credential_label_cursor,
	},
	grok: {
		hint: msg.credential_hint_grok,
		label: msg.credential_label_grok,
	},
} satisfies Record<
	EngineKind,
	{
		hint: (args: { engine: string }) => string;
		label: (args: { engine: string }) => string;
	}
>;

export function credentialFieldFor(engine: EngineKind): {
	hint: string;
	label: string;
} {
	const field = CREDENTIAL_FIELDS[engine];
	const name = engineLabel(engine);
	return {
		hint: field.hint({ engine: name }),
		label: field.label({ engine: name }),
	};
}
