import { Link } from "@tanstack/react-router";

import { readLabBranding } from "#/env.ts";
import { BetterAuthHeader } from "#/integrations/better-auth/header-user.tsx";
import { m as msg } from "#/paraglide/messages.js";

import { CatDoodle, KeyDoodle } from "./ui/doodles";

export function Header() {
	const branding = readLabBranding();
	return (
		<header className="border-ink bg-coat border-b-2">
			<nav className="mx-auto flex max-w-[42rem] flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-[17px] sm:px-6">
				<Link
					to="/"
					className="text-ink inline-flex items-center gap-1.5 font-bold no-underline hover:underline"
				>
					{msg.nav_lab()}
					<KeyDoodle className="text-key size-3.5" />
				</Link>
				<span className="text-ink/30" aria-hidden>
					·
				</span>
				<Link
					to="/about"
					className="text-eye no-underline hover:underline"
					activeProps={{ className: "font-bold text-scarf no-underline" }}
				>
					{msg.nav_notes()}
				</Link>
				<span className="text-ink/30" aria-hidden>
					·
				</span>
				<a
					href={branding.sourceRepoUrl}
					className="text-eye inline-flex items-baseline gap-1 no-underline hover:underline"
					target="_blank"
					rel="noreferrer"
				>
					{msg.nav_code_cave()}
					<CatDoodle className="text-sm" />
				</a>
				<span className="ml-auto">
					<BetterAuthHeader />
				</span>
			</nav>
		</header>
	);
}
