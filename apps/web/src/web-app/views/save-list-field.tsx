import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { TextField } from "#/components/ui/text-field.tsx";
import { m as msg } from "#/paraglide/messages.js";

import { REPO_SUBSETTING_FIELD_CLASS } from "./setting-classes.ts";

export function SaveListField(props: {
	busy: boolean;
	buttonLabel: string;
	className?: string;
	description: string;
	errors: string[];
	label: string;
	onChange: (value: string) => void;
	onSave: () => void;
	placeholder: string;
	value: string;
}): ReactNode {
	const className = props.className === undefined ? "" : `${props.className} `;
	return (
		<div className={`mt-3 ${className}${REPO_SUBSETTING_FIELD_CLASS}`}>
			<TextField
				autoComplete="off"
				description={props.description}
				isDisabled={props.busy}
				label={props.label}
				onChange={props.onChange}
				placeholder={props.placeholder}
				spellCheck={false}
				value={props.value}
			/>
			<div className="mt-2">
				<Button isDisabled={props.busy} onPress={props.onSave} variant="ghost">
					{props.busy ? msg.saving_ellipsis() : props.buttonLabel}
				</Button>
			</div>
			{props.errors.map((error) => (
				<div className="mt-2" key={error}>
					<ErrorMessage>{error}</ErrorMessage>
				</div>
			))}
		</div>
	);
}
