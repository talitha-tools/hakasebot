import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

const error = tv({
	base: "border-scarf bg-blush text-ink border-2 px-2 py-1.5",
});

export function ErrorMessage({ children }: { children: ReactNode }) {
	return (
		<p className={error()}>
			<span className="mr-1" aria-hidden>
				(；′⌒`)
			</span>
			{children}
		</p>
	);
}
