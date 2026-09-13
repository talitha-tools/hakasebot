import type {
	OauthEngine,
	VendorLoginEffect,
	VendorLoginEvent,
	VendorLoginState,
	VendorLoginView,
} from "@hakasebot/core/vendor-login.ts";
import { viewOf } from "@hakasebot/core/vendor-login.ts";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
	beginLogin,
	canResume,
	clearLoginStorage,
	createEffectWork,
	loadLoginStorage,
	runEffects,
	stepLogin,
	stopEffects,
} from "./login-interpreter.ts";
import type { EffectWork } from "./login-interpreter.ts";

export interface VendorLoginController {
	view: VendorLoginView;
	handleStart: () => void;
	handleCancel: () => void;
	handleSubmitCallback: (text: string) => void;
}

function readInitial(engine: OauthEngine): VendorLoginState {
	const loaded = loadLoginStorage();
	return canResume(loaded, engine) ? loaded : { kind: "idle" };
}

function applyLoginEvent(args: {
	deliver: (plaintext: string) => void;
	event: VendorLoginEvent;
	setState: Dispatch<SetStateAction<VendorLoginState>>;
	work: EffectWork;
}): void {
	let effects: readonly VendorLoginEffect[] = [];
	args.setState((prev) => {
		const { effects: nextEffects, state } = stepLogin(prev, args.event);
		effects = nextEffects;
		return state;
	});
	runEffects({
		applyEvent: (event) => {
			applyLoginEvent({ ...args, event });
		},
		effects,
		onCredential: args.deliver,
		work: args.work,
	});
}

function loginHandlers(args: {
	deliver: (plaintext: string) => void;
	engine: OauthEngine;
	setState: Dispatch<SetStateAction<VendorLoginState>>;
	work: EffectWork;
}): Omit<VendorLoginController, "view"> {
	return {
		handleCancel: () => {
			stopEffects(args.work);
			applyLoginEvent({ ...args, event: { kind: "cancel" } });
			applyLoginEvent({ ...args, event: { kind: "reset" } });
		},
		handleStart: () => {
			void (async () => {
				stopEffects(args.work);
				applyLoginEvent({
					...args,
					event: await beginLogin(args.engine),
				});
			})();
		},
		handleSubmitCallback: (text: string) => {
			applyLoginEvent({
				...args,
				event: { kind: "callback_pasted", now: Date.now(), text },
			});
		},
	};
}

export function useVendorLogin(args: {
	engine: OauthEngine;
	onCredential: (plaintext: string) => void;
}): VendorLoginController {
	const [state, setState] = useState<VendorLoginState>(() =>
		readInitial(args.engine),
	);
	const [engineGate, setEngineGate] = useState(args.engine);
	const work = useMemo(() => createEffectWork(), []);
	const engineChanged = args.engine !== engineGate;

	if (engineChanged) {
		stopEffects(work);
		clearLoginStorage();
		setEngineGate(args.engine);
		setState({ kind: "idle" });
	}

	useEffect(
		() => () => {
			stopEffects(work);
		},
		[work],
	);

	const viewState: VendorLoginState = engineChanged ? { kind: "idle" } : state;

	return {
		...loginHandlers({
			deliver: args.onCredential,
			engine: args.engine,
			setState,
			work,
		}),
		view: viewOf(viewState),
	};
}
