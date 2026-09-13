import type { ReactNode } from "react";
import { tv } from "tailwind-variants";

const section = tv({
	base: "border-ink bg-coat border-2 px-3 py-4 sm:px-4",
});

export function Section({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <section className={section({ className })}>{children}</section>;
}
