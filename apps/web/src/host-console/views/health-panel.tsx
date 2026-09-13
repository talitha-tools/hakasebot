import type { ReactNode } from "react";

import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import type { HostHealthStatus } from "#/host-console/domain.ts";
import { m as msg } from "#/paraglide/messages.js";

export function HealthPanel(props: { health: HostHealthStatus }): ReactNode {
	const { health } = props;

	return (
		<Section>
			<Label>{msg.host_health_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.host_health_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.host_health_intro()}
			</p>
			<div className="border-ink mt-6 border-2 px-4 py-4">
				{health.d1.kind === "ok" ? (
					<>
						<p className="text-ink m-0 font-bold">{msg.host_d1_ok()}</p>
						<p className="text-ink/75 m-0 mt-2">
							{msg.host_d1_migrations({
								count: String(health.d1.migrationCount),
							})}
						</p>
					</>
				) : (
					<>
						<p className="text-ink m-0 font-bold">{msg.host_d1_error()}</p>
						<div className="mt-2">
							<ErrorMessage>{health.d1.message}</ErrorMessage>
						</div>
					</>
				)}
			</div>
		</Section>
	);
}
