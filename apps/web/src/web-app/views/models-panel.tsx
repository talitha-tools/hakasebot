import type { ModelSlot } from "@hakasebot/core/vault/model-slot.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import { m as msg } from "#/paraglide/messages.js";
import { listVaultAccountsFn } from "#/web-app/accounts-rpc.ts";
import {
	deleteModelSlotFn,
	saveModelSlotFn,
	listModelSlotsFn,
	setDefaultModelSlotOrderFn,
} from "#/web-app/slots-rpc.ts";
import { webAppSnapshotFn } from "#/web-app/snapshot-rpc.ts";

import { DragHandle, SortableRow } from "./drag-handle.tsx";
import { AddModelSlotForm } from "./model-slot-form.tsx";

async function saveSlotSimilar(args: {
	similarModel: boolean;
	slot: ModelSlot;
}) {
	return saveModelSlotFn({
		data: {
			accountId: args.slot.accountId,
			defaultSortIndex: args.slot.defaultSortIndex,
			engine: args.slot.engine,
			fast: args.slot.fast,
			label: args.slot.label,
			model: args.slot.model,
			similarModel: args.similarModel,
			slotId: args.slot.id,
			...(args.slot.effort === undefined ? {} : { effort: args.slot.effort }),
		},
	});
}

function SlotRowInfo(props: { slot: ModelSlot }): ReactNode {
	return (
		<div className="min-w-0">
			<p className="text-ink m-0 font-bold">{props.slot.label}</p>
			<p className="text-ink/60 m-0 text-sm">
				{props.slot.engine} · {props.slot.model} ·{" "}
				{props.slot.effort ?? msg.models_effort_default()}
				{props.slot.fast ? ` · ${msg.models_fast_tag()}` : ""}
			</p>
		</div>
	);
}

function SlotRow(props: {
	busy: boolean;
	dragIndex: number | undefined;
	index: number;
	onDelete: (id: string) => void;
	onDragEnd: () => void;
	onDragStart: () => void;
	onDrop: (fromIndex: number) => void;
	onSimilarModel: (similarModel: boolean) => void;
	slot: ModelSlot;
}): ReactNode {
	return (
		<SortableRow
			busy={props.busy}
			className="border-ink flex flex-wrap items-center justify-between gap-2 border-2 px-3 py-2"
			dragging={props.dragIndex === props.index}
			index={props.index}
			label={props.slot.label}
			onDragEnd={props.onDragEnd}
			onDragStart={props.onDragStart}
			onDrop={props.onDrop}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<DragHandle />
				<SlotRowInfo slot={props.slot} />
			</div>
			<Checkbox
				isDisabled={props.busy}
				isSelected={props.slot.similarModel}
				onChange={props.onSimilarModel}
			>
				{msg.models_similar()}
			</Checkbox>
			<Button
				variant="ghost"
				isDisabled={props.busy}
				onPress={() => {
					props.onDelete(props.slot.id);
				}}
			>
				{msg.models_delete()}
			</Button>
		</SortableRow>
	);
}

function useSlotActions(
	githubUserId: string | undefined,
	slots: readonly ModelSlot[],
) {
	const queryClient = useQueryClient();
	const invalidate = async () =>
		queryClient.invalidateQueries({
			queryKey: ["vault", githubUserId, "model-slots"],
		});

	const similarMutation = useMutation({
		mutationFn: saveSlotSimilar,
		onSuccess: invalidate,
	});
	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			await deleteModelSlotFn({ data: { id } });
		},
		onSuccess: invalidate,
	});
	const reorderMutation = useMutation({
		mutationFn: async (orderedSlotIds: string[]) =>
			setDefaultModelSlotOrderFn({ data: { orderedSlotIds } }),
		onSuccess: invalidate,
	});

	return {
		busy:
			deleteMutation.isPending ||
			reorderMutation.isPending ||
			similarMutation.isPending,
		deleteSlot: (id: string) => {
			deleteMutation.mutate(id);
		},
		invalidate,
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
		setSimilar: (slot: ModelSlot, similarModel: boolean) => {
			similarMutation.mutate({ similarModel, slot });
		},
	};
}

function SlotList(props: {
	actions: ReturnType<typeof useSlotActions>;
	pending: boolean;
	slots: readonly ModelSlot[];
}): ReactNode {
	const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);
	const { deleteSlot, moveSlot, setSimilar } = props.actions;

	if (props.pending) {
		return <p className="text-ink/50 m-0 mt-2">{msg.models_looking()}</p>;
	}
	if (props.slots.length === 0) {
		return <p className="text-ink/50 m-0 mt-2">{msg.models_empty()}</p>;
	}
	return (
		<ul className="mt-3 flex flex-col gap-2">
			{props.slots.map((slot, index) => (
				<SlotRow
					busy={props.actions.busy}
					dragIndex={dragIndex}
					index={index}
					key={slot.id}
					onDelete={deleteSlot}
					onDragEnd={() => {
						setDragIndex(undefined);
					}}
					onDragStart={() => {
						setDragIndex(index);
					}}
					onDrop={(fromIndex) => {
						moveSlot(fromIndex, index);
					}}
					onSimilarModel={(next) => {
						setSimilar(slot, next);
					}}
					slot={slot}
				/>
			))}
		</ul>
	);
}

function useModelsPanelData() {
	const snapshotQuery = useQuery({
		queryFn: async () => webAppSnapshotFn(),
		queryKey: ["web-app", "snapshot"],
		staleTime: 30_000,
	});
	const githubUserId = snapshotQuery.data?.githubUserId;
	const accountsQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => listVaultAccountsFn(),
		queryKey: ["vault", githubUserId, "accounts"],
	});
	const slotsQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => listModelSlotsFn(),
		queryKey: ["vault", githubUserId, "model-slots"],
	});
	return {
		accounts: accountsQuery.data ?? [],
		githubUserId,
		slots: slotsQuery.data ?? [],
		slotsPending: slotsQuery.isPending,
	};
}

export function ModelsPanel(): ReactNode {
	const { accounts, githubUserId, slots, slotsPending } = useModelsPanelData();
	const actions = useSlotActions(githubUserId, slots);
	const { invalidate } = actions;

	return (
		<Section>
			<Label>{msg.models_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.models_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">{msg.models_intro()}</p>
			<AddModelSlotForm
				accounts={accounts}
				githubUserId={githubUserId}
				onSaved={invalidate}
				slotsCount={slots.length}
			/>
			<div className="mt-8">
				<h3 className="text-ink m-0 text-lg font-bold">
					{msg.models_order_heading()}
				</h3>
				<p className="text-ink/60 m-0 mt-1 text-sm">
					{msg.models_order_hint()}
				</p>
				<SlotList actions={actions} pending={slotsPending} slots={slots} />
			</div>
		</Section>
	);
}
