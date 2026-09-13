import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import { fetchClearCatalogCache } from "#/host-console/catalog-rpc.ts";
import { m as msg } from "#/paraglide/messages.js";

export function CatalogPanel(props: { token: string }): ReactNode {
	const mutation = useMutation({
		mutationFn: async () => fetchClearCatalogCache(props.token),
	});
	const result = mutation.data;
	let errorText: string | undefined;
	if (mutation.isError) {
		errorText = errorMessage(mutation.error, msg.host_catalog_failed());
	} else if (result?.kind === "unavailable") {
		errorText = result.message;
	}
	const forgotten = result?.kind === "cleared" && errorText === undefined;

	return (
		<Section>
			<Label>{msg.host_catalog_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.host_catalog_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.host_catalog_intro()}
			</p>
			<div className="mt-6">
				<Button
					isDisabled={mutation.isPending}
					onPress={() => {
						mutation.mutate();
					}}
				>
					{msg.host_catalog_forget()}
				</Button>
				{forgotten ? (
					<p className="text-ink/75 mt-3 mb-0">
						{msg.host_catalog_forgotten()}
					</p>
				) : undefined}
				{errorText === undefined ? undefined : (
					<div className="mt-3">
						<ErrorMessage>{errorText}</ErrorMessage>
					</div>
				)}
			</div>
		</Section>
	);
}
