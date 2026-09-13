import { Button as AriaButton } from "react-aria-components";
import type { ButtonProps as AriaButtonProps } from "react-aria-components";

import { button } from "./button-variants.ts";

type ButtonProps = AriaButtonProps & {
	variant?: "primary" | "ghost" | "quiet";
};

export function Button({
	className,
	variant = "primary",
	...props
}: ButtonProps) {
	return (
		<AriaButton
			{...props}
			className={(values) =>
				button({
					className:
						typeof className === "function" ? className(values) : className,
					variant,
				})
			}
		/>
	);
}
