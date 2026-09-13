import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { m as msg } from "#/paraglide/messages.js";

import { RotatePreview } from "./rotate-preview.tsx";
import { useRotateKey } from "./use-rotate-key.ts";

export function RotateKeyPanel(props: {
	className: string;
	confirmLabel: string;
	githubUserId: string | undefined;
	heading: string;
	headingTag: "h2" | "h3";
	intro: string;
	peekLabel: string;
}): ReactNode {
	const { cancel, confirm, error, peek, peeking, preview, rotating } =
		useRotateKey(props.githubUserId);
	const Heading = props.headingTag;

	return (
		<div className={`border-ink border-2 px-4 py-4 ${props.className}`}>
			<Heading className="text-ink m-0 text-lg font-bold">
				{props.heading}
			</Heading>
			<p className="text-ink/75 m-0 mt-2 max-w-[48ch] text-sm">{props.intro}</p>
			{preview === undefined ? (
				<div className="mt-4">
					<Button variant="ghost" isDisabled={peeking} onPress={peek}>
						{peeking ? msg.rotate_peeking() : props.peekLabel}
					</Button>
				</div>
			) : (
				<RotatePreview
					busy={rotating}
					confirmLabel={props.confirmLabel}
					onCancel={cancel}
					onConfirm={confirm}
					preview={preview}
				/>
			)}
			{error === undefined ? undefined : (
				<div className="mt-3">
					<ErrorMessage>{error}</ErrorMessage>
				</div>
			)}
		</div>
	);
}
