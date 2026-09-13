import type {
	GithubAppSlug,
	ParseResult,
	TriggerPhrase,
} from "@hakasebot/core/domain.ts";
import { githubAppSlug, mentionTrigger } from "@hakasebot/core/domain.ts";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { blankToUndefined, parseDeploymentInput } from "#/deployment-config.ts";
import type {
	DeploymentConfig,
	DeploymentConfigInput,
	LabBranding,
	PublicDeployment,
} from "#/deployment-config.ts";

const ENV_DEFAULTS = {
	VITE_ACTION_REF: "talitha-tools/hakasebot@main",
	VITE_LAB_URL: "http://localhost:47821",
	VITE_SOURCE_REPO_URL: "https://github.com/talitha-tools/hakasebot",
} as const;

// oxlint-disable-next-line node/no-process-env -- this module IS the typed t3-env boundary
const processEnv = process.env;

export const env = createEnv({
	client: {
		VITE_ACTION_REF: z.string().min(1).default(ENV_DEFAULTS.VITE_ACTION_REF),
		VITE_LAB_URL: z.url().default(ENV_DEFAULTS.VITE_LAB_URL),
		VITE_SOURCE_REPO_URL: z.url().default(ENV_DEFAULTS.VITE_SOURCE_REPO_URL),
	},

	clientPrefix: "VITE_",

	// Blank HOSTED_APP_* and VITE_* values would fail z.string().min(1) if empty
	// strings were kept. emptyStringAsUndefined lets the schema defaults apply.
	emptyStringAsUndefined: true,

	runtimeEnv: {
		...import.meta.env,
		...processEnv,
	},

	server: {
		BETTER_AUTH_SECRET: z.string().min(1),
		CATALOG_ANTHROPIC_API_KEY: z.string().min(1).optional(),
		CATALOG_ANTIGRAVITY_OAUTH: z.string().min(1).optional(),
		CATALOG_CURSOR_API_KEY: z.string().min(1).optional(),
		CATALOG_OPENAI_API_KEY: z.string().min(1).optional(),
		CATALOG_XAI_API_KEY: z.string().min(1).optional(),
		HOSTED_APP_CLIENT_ID: z.string().min(1),
		HOSTED_APP_CLIENT_SECRET: z.string().min(1),
		HOSTED_APP_PRIVATE_KEY: z.string().min(1).optional(),
		HOSTED_APP_SLUG: z.string().min(1).optional(),
		HOSTED_APP_WEBHOOK_SECRET: z.string().min(1).optional(),
		HOST_CONSOLE_TOKEN: z.string().min(1).optional(),
		LAB_DEV_GITHUB_TOKEN: z.string().min(1).optional(),
		LAB_DEV_GITHUB_USER_ID: z.string().min(1).optional(),
		LAB_DEV_USER: z.string().optional(),
		SERVER_URL: z.url().optional(),
	},

	skipValidation: processEnv["VITEST"] === "true",
});

function withDefaults(input: DeploymentConfigInput): DeploymentConfigInput {
	return {
		...input,
		actionRef:
			blankToUndefined(input.actionRef) ?? ENV_DEFAULTS.VITE_ACTION_REF,
		labUrl: blankToUndefined(input.labUrl) ?? ENV_DEFAULTS.VITE_LAB_URL,
		sourceRepoUrl:
			blankToUndefined(input.sourceRepoUrl) ??
			ENV_DEFAULTS.VITE_SOURCE_REPO_URL,
	};
}

export function parseDeploymentConfig(
	input: DeploymentConfigInput,
): ParseResult<DeploymentConfig> {
	return parseDeploymentInput(withDefaults(input));
}

function parsedDeployment(input: DeploymentConfigInput): DeploymentConfig {
	const parsed = parseDeploymentConfig(input);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

export function deploymentConfig(): DeploymentConfig {
	return parsedDeployment({
		actionRef: env.VITE_ACTION_REF,
		hostedAppClientId: env.HOSTED_APP_CLIENT_ID,
		hostedAppPrivateKey: env.HOSTED_APP_PRIVATE_KEY,
		hostedAppSlug: env.HOSTED_APP_SLUG,
		labUrl: env.VITE_LAB_URL,
		sourceRepoUrl: env.VITE_SOURCE_REPO_URL,
	});
}

export function readPublicDeployment(): PublicDeployment {
	const value = parsedDeployment({
		actionRef: env.VITE_ACTION_REF,
		labUrl: env.VITE_LAB_URL,
		sourceRepoUrl: env.VITE_SOURCE_REPO_URL,
	});
	return {
		actionRef: value.actionRef,
		lab: value.lab,
	};
}

export function readLabBranding(): LabBranding {
	return readPublicDeployment().lab;
}

export function readHostedAppSlug(): GithubAppSlug | undefined {
	const raw = env.HOSTED_APP_SLUG;
	if (raw === undefined) {
		return undefined;
	}
	const parsed = githubAppSlug(raw, "HOSTED_APP_SLUG");
	if (parsed.kind === "invalid") {
		return undefined;
	}
	return parsed.value;
}

export function readMentionTrigger(): TriggerPhrase | undefined {
	const slug = readHostedAppSlug();
	if (slug === undefined) {
		return undefined;
	}
	return mentionTrigger(slug);
}
