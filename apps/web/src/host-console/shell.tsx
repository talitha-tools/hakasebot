import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { m as msg } from "#/paraglide/messages.js";

import { clearHostConsoleToken } from "./session-token.ts";
import { fetchHostSnapshot } from "./snapshot-rpc.ts";
import { CatalogPanel } from "./views/catalog-panel.tsx";
import { DeploymentPanel } from "./views/deployment-panel.tsx";
import { HealthPanel } from "./views/health-panel.tsx";
import { StatsPanel } from "./views/stats-panel.tsx";

function ClearTokenButton(props: { label: string }): ReactNode {
	return (
		<Button
			variant="ghost"
			onPress={() => {
				clearHostConsoleToken();
				globalThis.location.reload();
			}}
		>
			{props.label}
		</Button>
	);
}

function SnapshotView(props: {
	snapshot: Awaited<ReturnType<typeof fetchHostSnapshot>>;
	token: string;
}): ReactNode {
	return (
		<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
			<div className="flex flex-col gap-6">
				<DeploymentPanel deployment={props.snapshot.deployment} />
				<HealthPanel health={props.snapshot.health} />
				<StatsPanel stats={props.snapshot.stats} />
				<CatalogPanel token={props.token} />
			</div>
			<div className="mt-6">
				<ClearTokenButton label={msg.host_bye()} />
			</div>
		</main>
	);
}

export function HostConsoleShell(props: { token: string }): ReactNode {
	const snapshotQuery = useQuery({
		queryFn: async () => fetchHostSnapshot(props.token),
		queryKey: ["host-console", "snapshot"],
		staleTime: 30_000,
	});

	if (snapshotQuery.isPending) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<p className="text-ink/50 m-0">{msg.host_peeking()}</p>
			</main>
		);
	}

	if (snapshotQuery.isError) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<ErrorMessage>
					{snapshotQuery.error instanceof Error
						? snapshotQuery.error.message
						: msg.host_flopped()}
				</ErrorMessage>
				<div className="mt-4">
					<ClearTokenButton label={msg.host_clear_token()} />
				</div>
			</main>
		);
	}

	const snapshot = snapshotQuery.data;
	if (snapshot === undefined) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<ErrorMessage>{msg.host_empty()}</ErrorMessage>
			</main>
		);
	}

	return <SnapshotView snapshot={snapshot} token={props.token} />;
}
