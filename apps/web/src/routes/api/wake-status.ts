import {
	handleWakeStatusGet,
	handleWakeStatusPatch,
} from "@hakasebot/core/wake-status.ts";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { deploymentConfig } from "#/env.ts";
import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";

void createServerFn;

function hostedAppPrivateKey(): string | undefined {
	const app = deploymentConfig().hostedBotApp;
	return app.kind === "configured" ? app.privateKey : undefined;
}

export const Route = createFileRoute("/api/wake-status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const db = await d1FromWorkerEnv();
				if (db === undefined) {
					return handleWakeStatusGet({ url: new URL(request.url) });
				}
				const store = createHomeStore(db);
				return handleWakeStatusGet({
					findWakeStatus: async (dispatchIdValue) =>
						store.getWakeStatus(dispatchIdValue),
					url: new URL(request.url),
				});
			},
			PATCH: async ({ request }) => {
				const appPrivateKey = hostedAppPrivateKey();
				const db = await d1FromWorkerEnv();
				if (db === undefined) {
					return handleWakeStatusPatch({
						appPrivateKey,
						request,
						url: new URL(request.url),
					});
				}
				const store = createHomeStore(db);
				return handleWakeStatusPatch({
					appPrivateKey,
					finishWakeRun: async (dispatchIdValue, status) =>
						store.finishWakeRun(dispatchIdValue, status),
					request,
					url: new URL(request.url),
				});
			},
		},
	},
});
