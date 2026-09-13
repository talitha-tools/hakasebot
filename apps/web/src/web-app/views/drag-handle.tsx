import type { DragEvent, ReactNode } from "react";

import { m as msg } from "#/paraglide/messages.js";

function preventDragOver(event: DragEvent<HTMLDivElement>) {
	event.preventDefault();
}

function startedFromAction(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		target.closest("button, [role='checkbox'], a, input, textarea, select") !==
			null
	);
}

function readFromIndex(event: DragEvent<HTMLDivElement>): number | undefined {
	const fromIndex = Number(event.dataTransfer.getData("text/plain"));
	if (Number.isNaN(fromIndex)) {
		return undefined;
	}
	return fromIndex;
}

export function DragHandle(): ReactNode {
	return (
		<span
			aria-hidden
			className="text-ink/60 shrink-0 cursor-grab text-sm active:cursor-grabbing"
		>
			⋮⋮
		</span>
	);
}

export function SortableRow(props: {
	busy: boolean;
	children: ReactNode;
	className: string;
	dragging: boolean;
	index: number;
	label: string;
	onDragEnd: () => void;
	onDragStart: () => void;
	onDrop: (fromIndex: number) => void;
}): ReactNode {
	function handleDragStart(event: DragEvent<HTMLDivElement>) {
		if (props.busy || startedFromAction(event.target)) {
			event.preventDefault();
			return;
		}
		event.dataTransfer.setData("text/plain", String(props.index));
		event.dataTransfer.effectAllowed = "move";
		props.onDragStart();
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		const fromIndex = readFromIndex(event);
		if (fromIndex === undefined) {
			return;
		}
		props.onDrop(fromIndex);
	}

	return (
		<li>
			<div
				aria-label={msg.models_drag({ label: props.label })}
				className={`${props.className} cursor-grab select-none active:cursor-grabbing`}
				draggable={!props.busy}
				onDragEnd={props.onDragEnd}
				onDragOver={preventDragOver}
				onDragStart={handleDragStart}
				onDrop={handleDrop}
				style={props.dragging ? { opacity: 0.55 } : undefined}
			>
				{props.children}
			</div>
		</li>
	);
}
