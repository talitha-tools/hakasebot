import type { ReactNode } from "react";

export function SettingGroup(props: {
	children: ReactNode;
	title: string;
}): ReactNode {
	return (
		<div className="border-ink/25 mt-4 border-t-2 pt-4">
			<p className="text-ink m-0 text-base font-bold">{props.title}</p>
			<div className="mt-2">{props.children}</div>
		</div>
	);
}
