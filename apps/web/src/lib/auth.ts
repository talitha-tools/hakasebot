/**
 * GitHub App user-to-server OAuth for Lab sign-in. No D1 / KV session table.
 *
 * Tradeoff: better-auth runs in **stateless cookie mode** (no `database`).
 * Session + GitHub account (including the User token and refresh token) live
 * in sealed cookies (`session_data` / `account_data`). Sessions cannot be
 * revoked server-side without rotating `BETTER_AUTH_SECRET` or bumping
 * cookie-cache `version`. Multi-instance Workers are fine because nothing is
 * stored in memory.
 *
 * Client ID / secret are the Hosted bot App's OAuth pair, not a separate
 * OAuth App. Permissions come from the App registration (ADR-0030). Do not
 * request classic `repo` / `workflow` scopes. better-auth `getAccessToken`
 * refreshes the 8h User token from the account-cookie refresh token.
 *
 * better-auth `baseURL.allowedHosts` is the Lab origin host (`VITE_LAB_URL`,
 * ADR-0038), plus other loopback hosts when that origin is loopback. When
 * `LAB_DEV_USER=1`, loopback hosts are always included too so local `vite
 * dev` still works if wrangler vars pin the public origin. The request
 * origin is used when it matches. GitHub App callback is
 * `{VITE_LAB_URL}/api/auth/callback/github`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { env } from "#/env";
import { isLoopbackHostname } from "#/lib/dev-user";

const LOOPBACK_AUTH_HOSTS = [
	"localhost",
	"localhost:*",
	"127.0.0.1",
	"127.0.0.1:*",
] as const;

export function labAuthAllowedHosts(
	labUrl: string,
	options?: { includeLoopback?: boolean },
): {
	allowedHosts: string[];
} {
	const { host, hostname } = new URL(labUrl);
	const includeLoopback =
		options?.includeLoopback === true || isLoopbackHostname(hostname);
	if (includeLoopback) {
		const hosts = new Set<string>([host, ...LOOPBACK_AUTH_HOSTS]);
		return { allowedHosts: [...hosts] };
	}
	return { allowedHosts: [host] };
}

export const auth = betterAuth({
	account: {
		storeAccountCookie: true,
		storeStateStrategy: "cookie",
	},
	appName: "hakasebot",
	baseURL: labAuthAllowedHosts(env.VITE_LAB_URL, {
		includeLoopback: env.LAB_DEV_USER === "1",
	}),
	emailAndPassword: {
		enabled: false,
	},
	plugins: [tanstackStartCookies()],
	secret: env.BETTER_AUTH_SECRET,
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60 * 60 * 24 * 7,
			refreshCache: true,
			strategy: "jwe",
		},
	},
	socialProviders: {
		github: {
			clientId: env.HOSTED_APP_CLIENT_ID,
			clientSecret: env.HOSTED_APP_CLIENT_SECRET,
			disableDefaultScope: true,
		},
	},
});
