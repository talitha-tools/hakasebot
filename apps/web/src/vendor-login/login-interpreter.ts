import type {
	OauthEngine,
	RequestId,
	TokenRequest,
	VendorLoginEffect,
	VendorLoginEvent,
	VendorLoginState,
} from "@hakasebot/core/vendor-login.ts";
import { createPkce, reduceVendorLogin } from "@hakasebot/core/vendor-login.ts";
import { createClientOnlyFn, createIsomorphicFn } from "@tanstack/react-start";

import {
	clearVendorLogin as clearVendorLoginImpl,
	loadVendorLogin as loadVendorLoginImpl,
	saveVendorLogin as saveVendorLoginImpl,
	scheduleWake as scheduleWakeImpl,
	sendTokenRequest as sendTokenRequestImpl,
} from "./login-io.client.ts";

export const clearLoginStorage = createIsomorphicFn()
	.client(clearVendorLoginImpl)
	.server(() => {
		/* empty */
	});

export const loadLoginStorage = createIsomorphicFn()
	.client(loadVendorLoginImpl)
	.server((): VendorLoginState => ({ kind: "idle" }));

const saveVendorLogin = createClientOnlyFn(saveVendorLoginImpl);
const scheduleWake = createClientOnlyFn(scheduleWakeImpl);
const sendTokenRequest = createClientOnlyFn(sendTokenRequestImpl);

export interface EffectWork {
	generation: number;
	wakeCancel: (() => void) | undefined;
}

export type ApplyLoginEvent = (event: VendorLoginEvent) => void;

export function createEffectWork(): EffectWork {
	return { generation: 0, wakeCancel: undefined };
}

export function canResume(
	state: VendorLoginState,
	engine: OauthEngine,
): boolean {
	return (
		state.kind === "active" &&
		state.engine === engine &&
		state.phase.kind === "authorize"
	);
}

export function stopEffects(work: EffectWork): void {
	work.wakeCancel?.();
	work.wakeCancel = undefined;
	work.generation += 1;
}

function runHttp(args: {
	applyEvent: ApplyLoginEvent;
	gen: number;
	request: TokenRequest;
	requestId: RequestId;
	work: EffectWork;
}): void {
	void (async () => {
		const outcome = await sendTokenRequest({ request: args.request });
		if (args.work.generation !== args.gen) {
			return;
		}
		if (outcome.kind === "unreachable") {
			args.applyEvent({
				kind: "http_failed",
				message: outcome.message,
				now: Date.now(),
				requestId: args.requestId,
			});
			return;
		}
		args.applyEvent({
			kind: "http_ok",
			now: Date.now(),
			requestId: args.requestId,
			response: outcome.response,
		});
	})();
}

export function runEffects(args: {
	applyEvent: ApplyLoginEvent;
	effects: readonly VendorLoginEffect[];
	onCredential: (plaintext: string) => void;
	work: EffectWork;
}): void {
	const gen = args.work.generation;
	for (const effect of args.effects) {
		switch (effect.kind) {
			case "credential": {
				args.onCredential(effect.plaintext);
				break;
			}
			case "wake_at": {
				args.work.wakeCancel?.();
				args.work.wakeCancel = scheduleWake(effect.at, () => {
					if (args.work.generation !== gen) {
						return;
					}
					args.applyEvent({ kind: "tick", now: Date.now() });
				});
				break;
			}
			case "http": {
				runHttp({
					applyEvent: args.applyEvent,
					gen,
					request: effect.request,
					requestId: effect.requestId,
					work: args.work,
				});
				break;
			}
		}
	}
}

export function stepLogin(
	state: VendorLoginState,
	event: VendorLoginEvent,
): { effects: readonly VendorLoginEffect[]; state: VendorLoginState } {
	const reduced = reduceVendorLogin(state, event);
	saveVendorLogin(reduced.state);
	return reduced;
}

export async function beginLogin(
	engine: OauthEngine,
): Promise<VendorLoginEvent> {
	const pkce = await createPkce();
	return { engine, kind: "start", now: Date.now(), pkce };
}
