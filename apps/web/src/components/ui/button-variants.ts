import { tv } from "tailwind-variants";

export const button = tv({
	base: "border-ink inline-flex cursor-pointer items-center justify-center gap-1 border-2 px-3 py-1.5 text-[17px] outline-none disabled:cursor-not-allowed disabled:opacity-50",
	defaultVariants: {
		variant: "primary",
	},
	variants: {
		variant: {
			ghost: "bg-coat text-ink hover:bg-blush",
			primary: "bg-accent text-ink hover:bg-blush font-bold",
			quiet:
				"text-eye hover:text-scarf border-0 bg-transparent px-0 py-0 underline",
		},
	},
});
