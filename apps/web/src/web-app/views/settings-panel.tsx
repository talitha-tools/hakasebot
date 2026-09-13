import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { webAppSnapshotFn } from "#/web-app/snapshot-rpc.ts";

import { DeleteAccountBlock } from "./delete-account-block.tsx";
import { EncryptionKeyExportBlock } from "./encryption-key-block.tsx";
import { HomeRepoBlock } from "./home-repo-block.tsx";
import { RotateKeyPanel } from "./rotate-key-panel.tsx";

export function SettingsPanel(): ReactNode {
	const snapshotQuery = useQuery({
		queryFn: async () => webAppSnapshotFn(),
		queryKey: ["web-app", "snapshot"],
		staleTime: 30_000,
	});
	const githubUserId = snapshotQuery.data?.githubUserId;

	return (
		<Section>
			<Label>{msg.settings_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.settings_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.settings_intro()}
			</p>
			<HomeRepoBlock githubUserId={githubUserId} />
			<EncryptionKeyExportBlock githubUserId={githubUserId} />
			<RotateKeyPanel
				className="mt-6"
				confirmLabel={msg.rotate_confirm()}
				githubUserId={githubUserId}
				heading={msg.rotate_heading()}
				headingTag="h3"
				intro={msg.rotate_intro()}
				peekLabel={msg.rotate_peek()}
			/>
			<DeleteAccountBlock githubUserId={githubUserId} />
		</Section>
	);
}
