import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { m as msg } from "#/paraglide/messages.js";

export function ConfirmCancelButtons(props: {
	busy: boolean;
	busyLabel: string;
	confirmLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
}): ReactNode {
	return (
		<div className="mt-4 flex flex-wrap gap-2">
			<Button isDisabled={props.busy} onPress={props.onConfirm}>
				{props.busy ? props.busyLabel : props.confirmLabel}
			</Button>
			<Button variant="ghost" isDisabled={props.busy} onPress={props.onCancel}>
				{msg.cancel()}
			</Button>
		</div>
	);
}
