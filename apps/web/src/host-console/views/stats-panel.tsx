import type { ReactNode } from "react";

import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import type { HostInstanceStats } from "#/host-console/domain.ts";
import { m as msg } from "#/paraglide/messages.js";

function StatRow(props: { label: string; value: number }): ReactNode {
	return (
		<div className="border-ink/20 flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
			<span className="text-ink/60 text-sm font-bold">{props.label}</span>
			<span className="text-ink text-lg font-bold tabular-nums">
				{props.value}
			</span>
		</div>
	);
}

export function StatsPanel(props: { stats: HostInstanceStats }): ReactNode {
	const { stats } = props;

	return (
		<Section>
			<Label>{msg.host_stats_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.host_stats_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.host_stats_intro()}
			</p>
			<div className="border-ink mt-6 border-2 px-4 py-2">
				<StatRow label={msg.host_stat_people()} value={stats.userCount} />
				<StatRow label={msg.host_stat_repos()} value={stats.enabledRepoCount} />
				<StatRow
					label={msg.host_stat_logins()}
					value={stats.vaultAccountCount}
				/>
				<StatRow label={msg.host_stat_brains()} value={stats.modelSlotCount} />
			</div>
		</Section>
	);
}
