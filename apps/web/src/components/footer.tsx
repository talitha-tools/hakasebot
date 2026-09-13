import { m as msg } from "#/paraglide/messages.js";

import { CatDoodle, KeyDoodle, SharkDoodle } from "./ui/doodles";

export function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="text-ink/55 mx-auto w-full max-w-[42rem] px-4 py-8 text-[15px] sm:px-6">
			<hr className="border-ink/30" />
			<p className="mt-3 mb-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<span>
					{msg.footer_copyright({
						year: String(year),
					})}
				</span>
				<span aria-hidden>·</span>
				<KeyDoodle className="text-key size-3.5" />
				<span aria-hidden>·</span>
				<CatDoodle />
				<span aria-hidden>·</span>
				<SharkDoodle className="text-eye" />
			</p>
		</footer>
	);
}
