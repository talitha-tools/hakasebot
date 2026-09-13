/** Facade: one adapter per engine, and the only place engine → adapter is decided. */
import { exhaustive } from "#/domain.ts";

import type { VendorAdapter } from "./adapters/adapter.ts";
import { antigravityAdapter } from "./adapters/antigravity.ts";
import { claudeAdapter } from "./adapters/claude.ts";
import { codexAdapter } from "./adapters/codex.ts";
import { grokAdapter } from "./adapters/grok.ts";
import type { OauthEngine } from "./domain.ts";

export type {
	AuthorizationCodeAdapter,
	DeviceCodeAdapter,
	OnResponseArgs,
	ResponseStep,
	VendorAdapter,
} from "./adapters/adapter.ts";
export { parseCallbackPaste } from "./adapters/callback.ts";
export { antigravityAdapter } from "./adapters/antigravity.ts";
export { claudeAdapter } from "./adapters/claude.ts";
export { codexAdapter } from "./adapters/codex.ts";
export { grokAdapter } from "./adapters/grok.ts";

export function adapterFor(engine: OauthEngine): VendorAdapter {
	switch (engine) {
		case "claude": {
			return claudeAdapter;
		}
		case "codex": {
			return codexAdapter;
		}
		case "grok": {
			return grokAdapter;
		}
		case "antigravity": {
			return antigravityAdapter;
		}
		default: {
			return exhaustive(engine);
		}
	}
}
