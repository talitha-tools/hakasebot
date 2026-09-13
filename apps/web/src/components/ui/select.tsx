import type { ReactNode } from "react";
import {
	Button,
	FieldError,
	Label,
	ListBox,
	ListBoxItem,
	Popover,
	Select as AriaSelect,
	SelectValue,
} from "react-aria-components";
import type { SelectProps as AriaSelectProps } from "react-aria-components";
import { tv } from "tailwind-variants";

const field = tv({
	base: "flex flex-col gap-1",
});

const labelClass = tv({
	base: "font-bold",
});

const trigger = tv({
	base: "border-ink bg-coat text-ink flex w-full cursor-pointer items-center justify-between gap-2 border-2 px-2 py-1.5 text-[16px] outline-none",
});

const popover = tv({
	base: "border-ink bg-coat min-w-[var(--trigger-width)] border-2 outline-none",
});

const list = tv({
	base: "max-h-60 overflow-auto outline-none",
});

const item = tv({
	base: "text-ink data-focused:bg-blush cursor-pointer px-2 py-1.5 text-[16px] outline-none data-selected:font-bold",
});

const errorClass = tv({
	base: "text-scarf text-sm",
});

interface SelectOption {
	id: string;
	label: string;
}

type SelectProps<T extends SelectOption> = Omit<
	AriaSelectProps<T>,
	"children"
> & {
	label: ReactNode;
	options: readonly T[];
};

export function Select<T extends SelectOption>({
	label,
	options,
	className,
	...props
}: SelectProps<T>) {
	return (
		<AriaSelect
			{...props}
			className={(values) =>
				field({
					className:
						typeof className === "function" ? className(values) : className,
				})
			}
		>
			<Label className={labelClass()}>{label}</Label>
			<Button className={trigger()}>
				<SelectValue />
				<span aria-hidden>▼</span>
			</Button>
			<Popover className={popover()}>
				<ListBox className={list()} items={[...options]}>
					{(option) => (
						<ListBoxItem
							id={option.id}
							textValue={option.label}
							className={item()}
						>
							{option.label}
						</ListBoxItem>
					)}
				</ListBox>
			</Popover>
			<FieldError className={errorClass()} />
		</AriaSelect>
	);
}
