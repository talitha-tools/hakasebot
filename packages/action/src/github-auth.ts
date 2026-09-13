import type {
	Bot,
	GithubAppId,
	GithubAppPrivateKey,
	GithubInstallationId,
	GithubToken,
	ParseResult,
} from "@hakasebot/core/domain.ts";
import { mintInstallationToken } from "@hakasebot/core/github-api.server.ts";
import type { InstallationGrant } from "@hakasebot/core/github-api.server.ts";

export const TOKEN_MIN_REMAINING_MS = 5 * 60 * 1000;

export interface BotAuth {
	fresh: () => Promise<ParseResult<GithubToken>>;
}

/** Dedupes concurrent calls onto one in-flight promise. */
function singleFlight<T>(load: () => Promise<T>): () => Promise<T> {
	let inflight: Promise<T> | undefined;
	return async () => {
		if (inflight !== undefined) {
			return inflight;
		}
		const pending = load();
		inflight = pending;
		try {
			return await pending;
		} finally {
			inflight = undefined;
		}
	};
}

export function botAuth(
	bot: Bot,
	deps?: {
		mint?: (args: {
			appId: GithubAppId;
			installationId: GithubInstallationId;
			privateKey: GithubAppPrivateKey;
		}) => Promise<ParseResult<InstallationGrant>>;
		now?: () => number;
	},
): BotAuth {
	const now = deps?.now ?? Date.now;
	const mint = deps?.mint ?? mintInstallationToken;
	let grant: InstallationGrant | undefined;

	const load = async (): Promise<ParseResult<GithubToken>> => {
		if (bot.kind === "actions-bot") {
			return { kind: "ok", value: bot.token };
		}
		if (
			grant !== undefined &&
			grant.expiresAt - now() > TOKEN_MIN_REMAINING_MS
		) {
			return { kind: "ok", value: grant.token };
		}
		const minted = await mint({
			appId: bot.appId,
			installationId: bot.installationId,
			privateKey: bot.privateKey,
		});
		if (minted.kind === "invalid") {
			return minted;
		}
		grant = minted.value;
		return { kind: "ok", value: grant.token };
	};

	return { fresh: singleFlight(load) };
}
