import { buildHomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import { createD1VaultStore } from "@hakasebot/core/vault/store.ts";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { readWorkerModelCatalog } from "#/catalog-bindings.ts";
import { deploymentConfig } from "#/env.ts";
import { handleHomeRuntimeGet } from "#/home-runtime.ts";
import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";

void createServerFn;

function hostedAppPrivateKey(): string | undefined {
	const app = deploymentConfig().hostedBotApp;
	return app.kind === "configured" ? app.privateKey : undefined;
}

export const Route = createFileRoute("/api/home-runtime")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const appPrivateKey = hostedAppPrivateKey();
				const db = await d1FromWorkerEnv();
				if (db === undefined) {
					return handleHomeRuntimeGet({
						appPrivateKey,
						request,
						url: new URL(request.url),
					});
				}
				const homeStore = createHomeStore(db);
				const vaultStore = createD1VaultStore(db);
				return handleHomeRuntimeGet({
					appPrivateKey,
					buildPack: async (wake) =>
						buildHomeRuntimePack({
							catalogFor: async (engine) => {
								const catalog = await readWorkerModelCatalog(engine);
								return catalog.kind === "ok" ? catalog.value : undefined;
							},
							consumer: wake.consumer,
							githubUserId: wake.githubUserId,
							store: vaultStore,
						}),
					findWake: async (dispatchIdValue) =>
						homeStore.findWakeForRuntimePack(dispatchIdValue),
					request,
					url: new URL(request.url),
				});
			},
		},
	},
});
