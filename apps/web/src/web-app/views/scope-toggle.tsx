import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";

import { REPO_OPTION_BUTTON_CLASS } from "./setting-classes.ts";

export function ScopeToggleGroup<T extends string>(props: {
	ariaLabel: string;
	disabled: boolean;
	error?: string | undefined;
	hint: string;
	label: (value: T) => string;
	onPick: (value: T) => void;
	options: readonly T[];
	value: T;
}): ReactNode {
	return (
		<div>
			<fieldset
				aria-label={props.ariaLabel}
				className="border-ink m-0 inline-flex border-2 p-0"
			>
				{props.options.map((option) => (
					<Button
						aria-pressed={props.value === option}
						className={REPO_OPTION_BUTTON_CLASS}
						isDisabled={props.disabled}
						key={option}
						onPress={() => {
							if (props.value !== option) {
								props.onPick(option);
							}
						}}
						variant={props.value === option ? "primary" : "ghost"}
					>
						{props.label(option)}
					</Button>
				))}
			</fieldset>
			<p className="text-ink/55 m-0 mt-2 max-w-[48ch] text-xs">{props.hint}</p>
			{props.error === undefined ? undefined : (
				<p className="text-danger m-0 mt-1 text-xs">{props.error}</p>
			)}
		</div>
	);
}
