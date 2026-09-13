import { z } from "zod";

import { githubAppInstallationId } from "#/domain.ts";
import type { GithubInstallationId, ParseResult } from "#/domain.ts";
import { parseUnknown } from "#/zod-parse.ts";

const missingEvents = "github app response missing events";
const missingHookUrl = "github app hook config missing url";
const missingToken = "installation token response missing token";

export const githubAppEventsSchema = z.object(
	{
		events: z.array(z.string({ error: "github app events must be strings" }), {
			error: missingEvents,
		}),
	},
	{ error: missingEvents },
);

export const githubAppHookUrlSchema = z.object(
	{
		url: z
			.string({ error: missingHookUrl })
			.trim()
			.min(1, { error: missingHookUrl }),
	},
	{ error: missingHookUrl },
);

export const installationTokenSchema = z.object(
	{
		expires_at: z.string({
			error: "installation token response missing expires_at",
		}),
		token: z.string({ error: missingToken }),
	},
	{ error: missingToken },
);

export function installationIdFromPayload(
	json: unknown,
	label: string,
): ParseResult<GithubInstallationId> {
	const message = `${label} installation response missing id`;
	const numberedIdSchema = z.object(
		{ id: z.number({ error: message }) },
		{ error: message },
	);
	const parsed = parseUnknown(numberedIdSchema, json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return githubAppInstallationId(String(parsed.value.id));
}
