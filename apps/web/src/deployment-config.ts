import {
	actionRef,
	githubAppId,
	githubAppPrivateKey,
	githubAppSlug,
} from "@hakasebot/core/domain.ts";
import type {
	ActionRef,
	GithubAppId,
	GithubAppPrivateKey,
	GithubAppSlug,
	ParseResult,
} from "@hakasebot/core/domain.ts";

type HostedBotApp =
	| {
			clientId: GithubAppId;
			kind: "configured";
			privateKey: GithubAppPrivateKey;
			slug: GithubAppSlug;
	  }
	| { kind: "unset" };

interface LabBranding {
	sourceRepoUrl: string;
	url: string;
}

type HostedBotInstallLink =
	| { kind: "configured"; url: string }
	| { kind: "unset" };

interface DeploymentConfig {
	actionRef: ActionRef;
	hostedBotApp: HostedBotApp;
	lab: LabBranding;
}

type PublicDeployment = Pick<DeploymentConfig, "actionRef" | "lab">;

interface DeploymentConfigInput {
	actionRef?: string | undefined;
	hostedAppClientId?: string | undefined;
	hostedAppPrivateKey?: string | undefined;
	hostedAppSlug?: string | undefined;
	labUrl?: string | undefined;
	sourceRepoUrl?: string | undefined;
}

function blankToUndefined(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function parseHttpUrl(
	value: string | undefined,
	label: string,
): ParseResult<string> {
	const text = blankToUndefined(value);
	if (text === undefined) {
		return { kind: "invalid", message: `${label} must be an http(s) URL` };
	}
	try {
		const url = new URL(text);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return { kind: "invalid", message: `${label} must be an http(s) URL` };
		}
	} catch {
		return { kind: "invalid", message: `${label} must be an http(s) URL` };
	}
	return { kind: "ok", value: text };
}

function parseHostedBotApp(input: {
	hostedAppClientId?: string | undefined;
	hostedAppPrivateKey?: string | undefined;
	hostedAppSlug?: string | undefined;
}): ParseResult<HostedBotApp> {
	const clientId = blankToUndefined(input.hostedAppClientId);
	const privateKey = blankToUndefined(input.hostedAppPrivateKey);
	const slug = blankToUndefined(input.hostedAppSlug);
	if (privateKey === undefined && slug === undefined) {
		return { kind: "ok", value: { kind: "unset" } };
	}
	if (privateKey === undefined || slug === undefined) {
		return {
			kind: "invalid",
			message:
				"HOSTED_APP_PRIVATE_KEY and HOSTED_APP_SLUG must be set together",
		};
	}
	if (clientId === undefined) {
		return {
			kind: "invalid",
			message: "HOSTED_APP_CLIENT_ID is required to mint App JWTs",
		};
	}
	const parsedId = githubAppId(clientId);
	if (parsedId.kind === "invalid") {
		return parsedId;
	}
	const parsedKey = githubAppPrivateKey(privateKey);
	if (parsedKey.kind === "invalid") {
		return parsedKey;
	}
	const parsedSlug = githubAppSlug(slug, "HOSTED_APP_SLUG");
	if (parsedSlug.kind === "invalid") {
		return parsedSlug;
	}
	return {
		kind: "ok",
		value: {
			clientId: parsedId.value,
			kind: "configured",
			privateKey: parsedKey.value,
			slug: parsedSlug.value,
		},
	};
}

function hostedBotInstallUrl(slug: GithubAppSlug): string {
	return `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;
}

function hostedBotInstallLink(
	hostedBotApp: HostedBotApp,
): HostedBotInstallLink {
	if (hostedBotApp.kind === "unset") {
		return { kind: "unset" };
	}
	return {
		kind: "configured",
		url: hostedBotInstallUrl(hostedBotApp.slug),
	};
}

function parseDeploymentInput(
	input: DeploymentConfigInput,
): ParseResult<DeploymentConfig> {
	const hostedBotApp = parseHostedBotApp(input);
	if (hostedBotApp.kind === "invalid") {
		return hostedBotApp;
	}
	const action = blankToUndefined(input.actionRef);
	if (action === undefined) {
		return { kind: "invalid", message: "VITE_ACTION_REF is required" };
	}
	const parsedActionRef = actionRef(action);
	if (parsedActionRef.kind === "invalid") {
		return parsedActionRef;
	}
	const labUrl = parseHttpUrl(input.labUrl, "VITE_LAB_URL");
	if (labUrl.kind === "invalid") {
		return labUrl;
	}
	const sourceRepoUrl = parseHttpUrl(
		input.sourceRepoUrl,
		"VITE_SOURCE_REPO_URL",
	);
	if (sourceRepoUrl.kind === "invalid") {
		return sourceRepoUrl;
	}
	return {
		kind: "ok",
		value: {
			actionRef: parsedActionRef.value,
			hostedBotApp: hostedBotApp.value,
			lab: {
				sourceRepoUrl: sourceRepoUrl.value,
				url: labUrl.value,
			},
		},
	};
}

export type {
	DeploymentConfig,
	DeploymentConfigInput,
	HostedBotApp,
	HostedBotInstallLink,
	LabBranding,
	PublicDeployment,
};
export {
	blankToUndefined,
	hostedBotInstallLink,
	hostedBotInstallUrl,
	parseDeploymentInput,
};
