import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import type { HostedBotInstallLink } from "#/deployment-config.ts";
import { m as msg } from "#/paraglide/messages.js";

function HelperLink(props: {
	botLink: HostedBotInstallLink | undefined;
}): ReactNode {
	if (props.botLink?.kind === "configured") {
		return (
			<a
				className="text-accent-strong mt-2 inline-block underline"
				href={props.botLink.url}
				rel="noreferrer"
				target="_blank"
			>
				{msg.repos_helper_install()}
			</a>
		);
	}
	if (props.botLink?.kind === "unset") {
		return (
			<p className="text-ink/55 m-0 mt-2 text-sm">{msg.repos_helper_unset()}</p>
		);
	}
	return (
		<p className="text-ink/50 m-0 mt-2 text-sm">{msg.repos_helper_loading()}</p>
	);
}

export function HelperInstallBox(props: {
	botLink: HostedBotInstallLink | undefined;
	botLinkError: string | undefined;
	onDefaults: () => void;
	onRefresh: () => void;
}): ReactNode {
	return (
		<div className="border-ink mt-4 max-w-[48ch] border-2 border-dashed p-3">
			<p className="text-ink m-0 font-bold">{msg.repos_helper_heading()}</p>
			<p className="text-ink/60 m-0 mt-1 text-sm">{msg.repos_helper_body()}</p>
			{props.botLinkError === undefined ? undefined : (
				<div className="mt-2">
					<ErrorMessage>{props.botLinkError}</ErrorMessage>
				</div>
			)}
			<HelperLink botLink={props.botLink} />
			<div className="mt-2 flex flex-wrap gap-2">
				<Button variant="ghost" onPress={props.onRefresh}>
					{msg.repos_refresh()}
				</Button>
				<Button variant="ghost" onPress={props.onDefaults}>
					{msg.repos_defaults()}
				</Button>
			</div>
		</div>
	);
}
