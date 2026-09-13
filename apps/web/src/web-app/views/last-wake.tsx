import type { ReactNode } from "react";

import type { LastWake } from "#/home/store.ts";
import { m as msg } from "#/paraglide/messages.js";

export interface LastWakeViewProps {
	lastWake: LastWake | undefined;
}

function wakeStatus(lastWake: LastWake): string {
	if (lastWake.status === "failed") {
		return msg.last_wake_failed();
	}
	if (lastWake.runUrl !== undefined) {
		return msg.last_wake_woke();
	}
	if (lastWake.status === "queued") {
		return msg.last_wake_waiting();
	}
	return msg.last_wake_status({ status: lastWake.status });
}

export function LastWakeView(props: LastWakeViewProps): ReactNode {
	if (props.lastWake === undefined) {
		return <p className="text-ink/60 m-0 text-sm">{msg.last_wake_none()}</p>;
	}
	const createdAt = new Date(props.lastWake.createdAt).toISOString();
	return (
		<p className="text-ink/60 m-0 text-sm">
			{msg.last_wake_prefix()} {wakeStatus(props.lastWake)} ·{" "}
			<time dateTime={createdAt}>{createdAt}</time> ·{" "}
			{msg.last_wake_pr({ number: String(props.lastWake.pullNumber) })}
			{props.lastWake.runUrl === undefined ? undefined : (
				<>
					{" "}
					·{" "}
					<a
						className="text-accent-strong underline"
						href={props.lastWake.runUrl}
						rel="noreferrer"
						target="_blank"
					>
						{msg.last_wake_look()}
					</a>
				</>
			)}
		</p>
	);
}
