import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

const label = tv({
	base: "text-scarf font-bold",
});

export function Label({ children }: { children: ReactNode }) {
	return <div className={label()}>{children}</div>;
}
