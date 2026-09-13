import type { ModelSlot } from "@hakasebot/core/vault/model-slot.ts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { m as msg } from "#/paraglide/messages.js";
import {
	clearRepoModelListFn,
	listRepoModelSlotsFn,
	setRepoModelListFn,
} from "#/web-app/repos-rpc.ts";

import { DragHandle, SortableRow } from "./drag-handle.tsx";

function RepoSlotRow(props: {
	busy: boolean;
	dragIndex: number | undefined;
	index: number;
	onDragEnd: () => void;
	onDragStart: () => void;
	onDrop: (fromIndex: number) => void;
	slot: ModelSlot;
}): ReactNode {
	return (
		<SortableRow
			busy={props.busy}
			className="border-ink flex items-center gap-2 border-2 px-2 py-1"
			dragging={props.dragIndex === props.index}
			index={props.index}
			label={props.slot.label}
			onDragEnd={props.onDragEnd}
			onDragStart={props.onDragStart}
			onDrop={props.onDrop}
		>
			<DragHandle />
			<span className="text-ink text-sm">
				{props.slot.label} · {props.slot.model}
			</span>
		</SortableRow>
	);
}

function useRepoBrains(repo: string) {
	const slotsQuery = useQuery({
		queryFn: async () => listRepoModelSlotsFn({ data: { repo } }),
		queryKey: ["web-app", "repo-slots", repo],
	});

	const reorderMutation = useMutation({
		mutationFn: async (orderedSlotIds: string[]) =>
			setRepoModelListFn({
				data: { orderedSlotIds, repo },
			}),
		onSuccess: async () => {
			await slotsQuery.refetch();
		},
	});

	const clearOverrideMutation = useMutation({
		mutationFn: async () => clearRepoModelListFn({ data: { repo } }),
		onSuccess: async () => {
			await slotsQuery.refetch();
		},
	});

	const slots = slotsQuery.data ?? [];

	return {
		addSlot: (slotId: string) => {
			reorderMutation.mutate([...slots.map((slot) => slot.id), slotId]);
		},
		clearBusy: clearOverrideMutation.isPending,
		clearOverride: () => {
			clearOverrideMutation.mutate();
		},
		moveSlot: (fromIndex: number, toIndex: number) => {
			if (fromIndex === toIndex || reorderMutation.isPending) {
				return;
			}
			const next = [...slots];
			const [moved] = next.splice(fromIndex, 1);
			if (moved === undefined) {
				return;
			}
			next.splice(toIndex, 0, moved);
			reorderMutation.mutate(next.map((slot) => slot.id));
		},
		reorderBusy: reorderMutation.isPending,
		slots,
		slotsPending: slotsQuery.isPending,
	};
}

function AddBrainButtons(props: {
	allSlots: readonly ModelSlot[];
	onAdd: (slotId: string) => void;
	slots: readonly ModelSlot[];
}): ReactNode {
	return (
		<div className="mt-3">
			<p className="text-ink/60 m-0 text-sm">{msg.repo_brains_add()}</p>
			<div className="mt-2 flex flex-wrap gap-2">
				{props.allSlots
					.filter((slot) =>
						props.slots.every((active) => active.id !== slot.id),
					)
					.map((slot) => (
						<Button
							key={slot.id}
							variant="ghost"
							onPress={() => {
								props.onAdd(slot.id);
							}}
						>
							{msg.repo_brains_add_slot({ label: slot.label })}
						</Button>
					))}
			</div>
		</div>
	);
}

function BrainSlotList(props: {
	busy: boolean;
	moveSlot: (fromIndex: number, toIndex: number) => void;
	pending: boolean;
	slots: readonly ModelSlot[];
}): ReactNode {
	const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);

	if (props.pending) {
		return <p className="text-ink/50 m-0 mt-2">{msg.models_looking()}</p>;
	}

	return (
		<ul className="mt-2 flex flex-col gap-2">
			{props.slots.map((slot, index) => (
				<RepoSlotRow
					busy={props.busy}
					dragIndex={dragIndex}
					index={index}
					key={slot.id}
					onDragEnd={() => {
						setDragIndex(undefined);
					}}
					onDragStart={() => {
						setDragIndex(index);
					}}
					onDrop={(fromIndex) => {
						props.moveSlot(fromIndex, index);
					}}
					slot={slot}
				/>
			))}
		</ul>
	);
}

export function RepoBrainsSection(props: {
	allSlots: readonly ModelSlot[];
	repo: string;
}): ReactNode {
	const {
		addSlot,
		clearBusy,
		clearOverride,
		moveSlot,
		reorderBusy,
		slots,
		slotsPending,
	} = useRepoBrains(props.repo);

	return (
		<div>
			<h3 className="text-ink m-0 text-base font-bold">
				{msg.repo_brains_heading()}
			</h3>
			<p className="text-ink/60 m-0 mt-1 text-sm">{msg.repo_brains_intro()}</p>
			<BrainSlotList
				busy={reorderBusy}
				moveSlot={moveSlot}
				pending={slotsPending}
				slots={slots}
			/>
			<div className="mt-2 flex flex-wrap gap-2">
				<Button variant="ghost" isDisabled={clearBusy} onPress={clearOverride}>
					{msg.repo_brains_usual()}
				</Button>
			</div>
			{props.allSlots.length > 0 ? (
				<AddBrainButtons
					allSlots={props.allSlots}
					onAdd={addSlot}
					slots={slots}
				/>
			) : undefined}
		</div>
	);
}
