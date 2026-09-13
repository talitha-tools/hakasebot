import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { afterEach, expect, test } from "vitest";

import { githubAppId, githubAppInstallationId } from "#/domain.ts";
import {
	BOT_INSTALLATION_PERMISSIONS,
	mintInstallationToken,
	signAppJwt,
} from "#/github-api.server.ts";
import { decodeJwtPayload } from "#/vendor-login.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

test("signAppJwt uses the App client ID as iss", async () => {
	const jwt = await signAppJwt({
		appId: must(githubAppId("Iv23test")),
		privateKey: TEST_APP_PRIVATE_KEY,
	});
	const payload = decodeJwtPayload(jwt);
	expect(payload.kind).toBe("ok");
	if (payload.kind !== "ok") {
		return;
	}
	expect(payload.value).toEqual(
		expect.objectContaining({
			iss: "Iv23test",
		}),
	);
});

test("mintInstallationToken posts the skinny bot permission subset", async () => {
	let posted: unknown;
	restoreFetch = installGithubFetchMock({
		installationToken: (id, body) => {
			expect(id).toBe("99");
			posted = body;
			return {
				json: {
					expires_at: "2099-01-01T00:00:00Z",
					token: "ghs_skinny",
				},
			};
		},
	});

	const result = await mintInstallationToken({
		appId: must(githubAppId("42")),
		installationId: must(githubAppInstallationId("99")),
		privateKey: TEST_APP_PRIVATE_KEY,
	});

	expect(result).toEqual({
		kind: "ok",
		value: {
			expiresAt: Date.parse("2099-01-01T00:00:00Z"),
			token: "ghs_skinny",
		},
	});
	expect(posted).toEqual({ permissions: BOT_INSTALLATION_PERMISSIONS });
	expect(BOT_INSTALLATION_PERMISSIONS).toEqual({
		actions: "write",
		contents: "read",
		issues: "write",
		metadata: "read",
		pull_requests: "write",
	});
});
