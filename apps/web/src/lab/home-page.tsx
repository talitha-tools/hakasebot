import { LabHero } from "#/lab/lab-hero.tsx";
import { useUserSignedIn } from "#/lab/use-user-signed-in.ts";
import { VaultGateShell } from "#/lab/vault-gate.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { WebAppShell } from "#/web-app/shell.tsx";

export function HomePage() {
	const { isPending, signedIn } = useUserSignedIn();

	if (isPending) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<p className="text-ink/50 m-0">{msg.session_peeking()}</p>
			</main>
		);
	}

	if (!signedIn) {
		return (
			<main className="mx-auto max-w-[42rem] px-4 py-8 sm:px-6">
				<LabHero />
			</main>
		);
	}

	return (
		<VaultGateShell>
			<WebAppShell />
		</VaultGateShell>
	);
}
