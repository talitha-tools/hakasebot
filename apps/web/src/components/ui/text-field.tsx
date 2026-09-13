import type { ReactNode } from "react";
import {
	FieldError,
	Input,
	Label,
	Text,
	TextField as AriaTextField,
} from "react-aria-components";
import type { TextFieldProps as AriaTextFieldProps } from "react-aria-components";
import { tv } from "tailwind-variants";

const field = tv({
	base: "flex flex-col gap-1",
});

const labelClass = tv({
	base: "font-bold",
});

const inputClass = tv({
	base: "border-ink bg-coat text-ink placeholder:text-ink/40 focus:bg-blush/40 w-full border-2 px-2 py-1.5 text-[16px] outline-none",
});

const descriptionClass = tv({
	base: "text-ink/55 text-sm",
});

const errorClass = tv({
	base: "text-scarf text-sm",
});

type TextFieldProps = Omit<
	AriaTextFieldProps,
	"autoComplete" | "className" | "spellCheck"
> & {
	label: ReactNode;
	description?: ReactNode;
	placeholder?: string;
	inputClassName?: string;
	autoComplete?: string;
	spellCheck?: boolean;
	className?: AriaTextFieldProps["className"];
};

export function TextField({
	label,
	description,
	placeholder,
	className,
	inputClassName,
	autoComplete,
	spellCheck,
	...props
}: TextFieldProps) {
	return (
		<AriaTextField
			{...props}
			className={(values) =>
				field({
					className:
						typeof className === "function" ? className(values) : className,
				})
			}
		>
			<Label className={labelClass()}>{label}</Label>
			{description === undefined ? undefined : (
				<Text slot="description" className={descriptionClass()}>
					{description}
				</Text>
			)}
			<Input
				className={inputClass({ className: inputClassName })}
				{...(placeholder === undefined ? {} : { placeholder })}
				{...(autoComplete === undefined ? {} : { autoComplete })}
				{...(spellCheck === undefined ? {} : { spellCheck })}
			/>
			<FieldError className={errorClass()} />
		</AriaTextField>
	);
}
