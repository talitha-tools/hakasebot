import { githubUserToken } from "@hakasebot/core/domain.ts";
import type { D1DatabaseLike } from "@hakasebot/core/vault/store.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import sodium, { base64_variants, ready, to_base64 } from "libsodium-wrappers";
import { afterEach, expect, test, vi } from "vitest";

import type { DeploymentConfig } from "#/deployment-config.ts";
import { deploymentConfig, parseDeploymentConfig } from "#/env.ts";
import {
	bootstrapHomeRepo,
	refreshHomeInstallation,
} from "#/home/bootstrap.server.ts";
import { homeRepoName } from "#/home/name.ts";
import { m as msg } from "#/paraglide/messages.js";

vi.mock("cloudflare:workers", () => ({
	env: {
		get DB() {
			const db: unknown = Reflect.get(globalThis, "__homeBootstrapTestDb");
			return db;
		},
	},
}));

function createMemoryHomeDb(): D1DatabaseLike {
	return memoryD1();
}

function expectedHomeName(): string {
	const app = deploymentConfig().hostedBotApp;
	return homeRepoName(app.kind === "configured" ? app.slug : undefined);
}

function unsetBotDeployment(): DeploymentConfig {
	const parsed = parseDeploymentConfig({});
	if (parsed.kind !== "ok") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

function homeNameFor(config: DeploymentConfig): string {
	return homeRepoName(
		config.hostedBotApp.kind === "configured"
			? config.hostedBotApp.slug
			: undefined,
	);
}

function configuredBotDeployment(): DeploymentConfig {
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
		hostedAppSlug: "hakase-bot",
	});
	if (parsed.kind !== "ok") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

function homeRepoRef(name = expectedHomeName()) {
	return testRepoRef(`thea/${name}`, "930001");
}

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
	Reflect.deleteProperty(globalThis, "__homeBootstrapTestDb");
});

function testToken(value: string) {
	return must(githubUserToken(value));
}

function dispatcherHandlers(args: {
	createUserRepo: (body: unknown) => {
		json: unknown;
		status?: number;
	};
	getRepo?: (owner: string, name: string) => { json: unknown };
	getUser?: () => { json: unknown };
	name?: string;
	patchRepo?: (owner: string, name: string, body: unknown) => { json: unknown };
}) {
	const name = args.name ?? expectedHomeName();
	const repo = homeRepoRef(name);
	return {
		createUserRepo: args.createUserRepo,
		getContents: () => ({ json: { message: "Not Found" }, status: 404 }),
		getRepo:
			args.getRepo ??
			(() => ({
				json: {
					default_branch: "main",
					full_name: `thea/${name}`,
					id: Number(repo.id),
				},
			})),
		patchRepo: args.patchRepo ?? (() => ({ json: { private: false } })),
		putContents: () => ({ json: { content: { sha: "abc" } } }),
		repoInstallation: () => ({ json: { message: "Not Found" }, status: 404 }),
		...(args.getUser === undefined ? {} : { getUser: args.getUser }),
	};
}

const publicRuntimeRepoPatch = {
	has_discussions: false,
	has_issues: false,
	has_projects: false,
	has_pull_requests: false,
	has_wiki: false,
	private: false,
} as const;

test("bootstrapHomeRepo creates a public home repo with GitHub features off", async () => {
	const config = unsetBotDeployment();
	const name = homeNameFor(config);
	const repo = homeRepoRef(name);
	Reflect.set(globalThis, "__homeBootstrapTestDb", createMemoryHomeDb());
	let created: unknown;
	let patched: { body: unknown; name: string; owner: string } | undefined;
	restoreFetch = installGithubFetchMock(
		dispatcherHandlers({
			createUserRepo: (body) => {
				created = body;
				return {
					json: {
						full_name: `thea/${name}`,
						id: Number(repo.id),
					},
				};
			},
			name,
			patchRepo: (owner, repoName, body) => {
				patched = { body, name: repoName, owner };
				return { json: { private: false } };
			},
		}),
	);

	const result = await bootstrapHomeRepo({
		config,
		githubUserId: "42",
		token: testToken("ghu_test"),
	});

	expect(created).toEqual({
		auto_init: true,
		has_discussions: false,
		has_downloads: false,
		has_issues: false,
		has_projects: false,
		has_wiki: false,
		name,
		private: false,
	});
	expect(patched).toEqual({
		body: publicRuntimeRepoPatch,
		name,
		owner: "thea",
	});
	const valueWithRepo: unknown = expect.objectContaining({ repo });
	expect(result).toEqual({
		kind: "ok",
		value: valueWithRepo,
	});
});

test("bootstrapHomeRepo makes an existing home repo public with GitHub features off", async () => {
	const config = unsetBotDeployment();
	const name = homeNameFor(config);
	const repo = homeRepoRef(name);
	Reflect.set(globalThis, "__homeBootstrapTestDb", createMemoryHomeDb());
	let patched: { body: unknown; name: string; owner: string } | undefined;
	restoreFetch = installGithubFetchMock(
		dispatcherHandlers({
			createUserRepo: () => ({
				json: { message: "name already exists on this account" },
				status: 422,
			}),
			getUser: () => ({ json: { login: "thea" } }),
			name,
			patchRepo: (owner, repoName, body) => {
				patched = { body, name: repoName, owner };
				return { json: { private: false } };
			},
		}),
	);

	const result = await bootstrapHomeRepo({
		config,
		githubUserId: "42",
		token: testToken("ghu_test"),
	});

	expect(patched).toEqual({
		body: publicRuntimeRepoPatch,
		name,
		owner: "thea",
	});
	const valueWithRepo: unknown = expect.objectContaining({ repo });
	expect(result).toEqual({
		kind: "ok",
		value: valueWithRepo,
	});
});

test("refreshHomeInstallation makes the home repo public with GitHub features off", async () => {
	const repo = homeRepoRef("review-home");
	const db = createMemoryHomeDb();
	Reflect.set(globalThis, "__homeBootstrapTestDb", db);
	await db
		.prepare(
			`INSERT INTO home_repos (
        github_user_id, repo_id, repo_owner, repo_name, created_at
      ) VALUES (?, ?, ?, ?, 1)`,
		)
		.bind("42", repo.id, repo.owner, repo.name)
		.run();
	let patched: { body: unknown; name: string; owner: string } | undefined;
	restoreFetch = installGithubFetchMock({
		patchRepo: (owner, name, body) => {
			patched = { body, name, owner };
			return { json: { private: false } };
		},
		repoInstallation: () => ({ json: { message: "Not Found" }, status: 404 }),
	});

	const result = await refreshHomeInstallation({
		githubUserId: "42",
		token: testToken("ghu_test"),
	});

	expect(patched).toEqual({
		body: publicRuntimeRepoPatch,
		name: "review-home",
		owner: "thea",
	});
	expect(result.kind).toBe("invalid");
});

async function secretWriteHandlers() {
	await ready;
	const keyPair = sodium.crypto_box_keypair();
	const publicKey = to_base64(keyPair.publicKey, base64_variants.ORIGINAL);
	return {
		publicKey: () => ({
			json: { key: publicKey, key_id: "key-1" },
		}),
		putSecret: () => ({ json: {}, status: 201 }),
	};
}

test("bootstrapHomeRepo adds Home to the user installation before writing the dispatcher", async () => {
	const config = configuredBotDeployment();
	const name = homeNameFor(config);
	const repo = homeRepoRef(name);
	Reflect.set(globalThis, "__homeBootstrapTestDb", createMemoryHomeDb());
	let added: { id: string; repoId: string } | undefined;
	let covered = false;
	let wroteDispatcher = false;
	restoreFetch = installGithubFetchMock({
		...dispatcherHandlers({
			createUserRepo: () => ({
				json: { full_name: `thea/${name}`, id: Number(repo.id) },
			}),
			name,
		}),
		...(await secretWriteHandlers()),
		addUserInstallationRepo: (id, repoId) => {
			added = { id, repoId };
			covered = true;
			return { json: {}, status: 204 };
		},
		listUserInstallations: () => ({
			json: {
				installations: [
					{ account: { login: "acme" }, app_slug: "hakase-bot", id: 11 },
					{ account: { login: "thea" }, app_slug: "hakase-bot", id: 55 },
				],
			},
		}),
		putContents: () => {
			wroteDispatcher = true;
			return { json: { content: { sha: "abc" } } };
		},
		repoInstallation: () =>
			covered
				? { json: { id: 55 } }
				: { json: { message: "Not Found" }, status: 404 },
	});

	const result = await bootstrapHomeRepo({
		config,
		githubUserId: "42",
		token: testToken("ghu_test"),
	});

	expect(added).toEqual({ id: "55", repoId: repo.id });
	expect(wroteDispatcher).toBe(true);
	const valueWithCoverage: unknown = expect.objectContaining({
		installationId: "55",
		repo,
	});
	expect(result).toEqual({
		kind: "ok",
		value: valueWithCoverage,
	});
});

test("bootstrapHomeRepo skips add when Home is already covered", async () => {
	const config = configuredBotDeployment();
	const name = homeNameFor(config);
	const repo = homeRepoRef(name);
	Reflect.set(globalThis, "__homeBootstrapTestDb", createMemoryHomeDb());
	let added = false;
	restoreFetch = installGithubFetchMock({
		...dispatcherHandlers({
			createUserRepo: () => ({
				json: { full_name: `thea/${name}`, id: Number(repo.id) },
			}),
			name,
		}),
		...(await secretWriteHandlers()),
		addUserInstallationRepo: () => {
			added = true;
			return { json: {}, status: 204 };
		},
		repoInstallation: () => ({ json: { id: 55 } }),
	});

	const result = await bootstrapHomeRepo({
		config,
		githubUserId: "42",
		token: testToken("ghu_test"),
	});

	expect(added).toBe(false);
	const valueAlreadyCovered: unknown = expect.objectContaining({
		installationId: "55",
		repo,
	});
	expect(result).toEqual({
		kind: "ok",
		value: valueAlreadyCovered,
	});
});

test("bootstrapHomeRepo does not write the dispatcher when the App is not installed", async () => {
	const config = configuredBotDeployment();
	const name = homeNameFor(config);
	const repo = homeRepoRef(name);
	Reflect.set(globalThis, "__homeBootstrapTestDb", createMemoryHomeDb());
	let wroteDispatcher = false;
	restoreFetch = installGithubFetchMock({
		...dispatcherHandlers({
			createUserRepo: () => ({
				json: { full_name: `thea/${name}`, id: Number(repo.id) },
			}),
			name,
		}),
		listUserInstallations: () => ({
			json: {
				installations: [
					{ account: { login: "acme" }, app_slug: "hakase-bot", id: 11 },
				],
			},
		}),
		putContents: () => {
			wroteDispatcher = true;
			return { json: { content: { sha: "abc" } } };
		},
	});

	const result = await bootstrapHomeRepo({
		config,
		githubUserId: "42",
		token: testToken("ghu_test"),
	});

	expect(wroteDispatcher).toBe(false);
	expect(result).toEqual({
		kind: "invalid",
		message: msg.house_helper_install_first(),
	});
});
