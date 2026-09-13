import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { authClient } from "#/lib/auth-client";
import { m as msg } from "#/paraglide/messages.js";

export function SignInWithGithubButton() {
	const [busy, setBusy] = useState(false);
	const [signInError, setSignInError] = useState<string | undefined>(undefined);

	async function handleClick() {
		setSignInError(undefined);
		setBusy(true);
		try {
			await authClient.signIn.social({
				callbackURL: "/",
				provider: "github",
			});
		} catch (error) {
			const message = errorMessage(error, msg.sign_in_failed());
			setSignInError(message);
		}
		setBusy(false);
	}

	return (
		<div className="flex flex-col items-start gap-3">
			<Button
				isDisabled={busy}
				onPress={() => {
					void handleClick();
				}}
			>
				{busy ? msg.sign_in_busy() : msg.sign_in_github()}
			</Button>
			{signInError === undefined ? undefined : (
				<ErrorMessage>{signInError}</ErrorMessage>
			)}
		</div>
	);
}
