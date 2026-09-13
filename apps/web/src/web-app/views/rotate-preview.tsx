import type { RotateVaultPreview } from "@hakasebot/core/vault/store.ts";
import type { ReactNode } from "react";

import { m as msg } from "#/paraglide/messages.js";
import { formatRepoRef } from "#/web-app/domain.ts";

import { ConfirmCancelButtons } from "./confirm-cancel.tsx";

export function RotatePreview(props: {
	busy: boolean;
	confirmLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
	preview: RotateVaultPreview;
}): ReactNode {
	return (
		<div className="mt-4">
			<dl className="text-ink m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="font-bold">{msg.rotate_logins()}</dt>
				<dd className="m-0">{props.preview.accountCount}</dd>
				<dt className="font-bold">{msg.rotate_brains()}</dt>
				<dd className="m-0">{props.preview.slotCount}</dd>
				<dt className="font-bold">{msg.rotate_extras()}</dt>
				<dd className="m-0">{props.preview.overrideCount}</dd>
				<dt className="font-bold">{msg.rotate_repos()}</dt>
				<dd className="m-0">{props.preview.enabledRepoCount}</dd>
			</dl>
			{props.preview.repos.length > 0 ? (
				<div className="mt-3">
					<p className="text-ink/75 m-0 text-sm">{msg.rotate_stale_repos()}</p>
					<ul className="text-ink m-0 mt-2 list-disc pl-5 text-sm">
						{props.preview.repos.map((repo) => (
							<li key={formatRepoRef(repo)}>{formatRepoRef(repo)}</li>
						))}
					</ul>
				</div>
			) : undefined}
			<ConfirmCancelButtons
				busy={props.busy}
				busyLabel={msg.rotate_busy()}
				confirmLabel={props.confirmLabel}
				onCancel={props.onCancel}
				onConfirm={props.onConfirm}
			/>
		</div>
	);
}
