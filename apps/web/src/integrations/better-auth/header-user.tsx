import { Button } from "#/components/ui/button.tsx";
import { useUserSignedIn } from "#/lab/use-user-signed-in.ts";
import { authClient } from "#/lib/auth-client";
import { m as msg } from "#/paraglide/messages.js";

export function BetterAuthHeader() {
	const { dev, isPending, oauthName, signedIn } = useUserSignedIn();

	if (isPending) {
		return <span className="text-ink/40">…</span>;
	}

	if (oauthName !== undefined) {
		return (
			<span className="inline-flex items-baseline gap-2">
				<span className="text-ink/60">{oauthName}</span>
				<Button
					variant="quiet"
					onPress={() => {
						void authClient.signOut();
					}}
				>
					{msg.nav_sign_out()}
				</Button>
			</span>
		);
	}

	if (signedIn && dev.kind === "on") {
		return (
			<span className="text-ink/60">
				{msg.nav_dev_user({ name: dev.name })}
			</span>
		);
	}

	return (
		<Button
			variant="quiet"
			onPress={() => {
				void authClient.signIn.social({
					callbackURL: "/",
					provider: "github",
				});
			}}
		>
			{msg.nav_sign_in()}
		</Button>
	);
}
