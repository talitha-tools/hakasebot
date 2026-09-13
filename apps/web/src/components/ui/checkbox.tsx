import type { ReactNode } from "react";
import { CheckboxButton, CheckboxField } from "react-aria-components";
import type { CheckboxFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";

const checkbox = tv({
	base: "group flex cursor-pointer items-center gap-2 outline-none",
});

const box = tv({
	base: "border-ink group-data-selected:bg-accent flex size-4 shrink-0 items-center justify-center border-2 text-xs",
});

type CheckboxProps = Omit<CheckboxFieldProps, "children"> & {
	children: ReactNode;
};

export function Checkbox({ children, className, ...props }: CheckboxProps) {
	return (
		<CheckboxField {...props}>
			<CheckboxButton
				className={(values) =>
					checkbox({
						className:
							typeof className === "function" ? className(values) : className,
					})
				}
			>
				{({ isSelected }) => (
					<>
						<span className={box()}>{isSelected ? "X" : undefined}</span>
						<span>{children}</span>
					</>
				)}
			</CheckboxButton>
		</CheckboxField>
	);
}
