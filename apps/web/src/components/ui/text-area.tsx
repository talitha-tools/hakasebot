import type { ReactNode } from "react";
import {
	FieldError,
	Label,
	Text,
	TextArea as AriaTextArea,
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

const areaClass = tv({
	base: "border-ink bg-coat text-ink placeholder:text-ink/40 focus:bg-blush/40 w-full resize-y border-2 px-2 py-1.5 font-mono text-sm leading-relaxed outline-none",
});

const descriptionClass = tv({
	base: "text-ink/55 text-sm",
});

const errorClass = tv({
	base: "text-scarf text-sm",
});

type TextAreaFieldProps = Omit<
	AriaTextFieldProps,
	"autoComplete" | "className" | "spellCheck"
> & {
	label?: ReactNode;
	description?: ReactNode;
	placeholder?: string;
	rows?: number;
	autoComplete?: string;
	spellCheck?: boolean;
	className?: AriaTextFieldProps["className"];
};

export function TextAreaField({
	label,
	description,
	placeholder,
	rows = 5,
	className,
	autoComplete,
	spellCheck,
	...props
}: TextAreaFieldProps) {
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
			{label === undefined ? undefined : (
				<Label className={labelClass()}>{label}</Label>
			)}
			{description === undefined ? undefined : (
				<Text slot="description" className={descriptionClass()}>
					{description}
				</Text>
			)}
			<AriaTextArea
				className={areaClass()}
				rows={rows}
				{...(placeholder === undefined ? {} : { placeholder })}
				{...(autoComplete === undefined ? {} : { autoComplete })}
				{...(spellCheck === undefined ? {} : { spellCheck })}
			/>
			<FieldError className={errorClass()} />
		</AriaTextField>
	);
}
