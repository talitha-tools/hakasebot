import type { CatalogModel, EngineKind } from "@hakasebot/core/domain.ts";
import type { VaultAccountMeta } from "@hakasebot/core/vault/domain.ts";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Select } from "#/components/ui/select.tsx";
import { TextField } from "#/components/ui/text-field.tsx";
import { m as msg } from "#/paraglide/messages.js";

import {
	catalogMessageFor,
	catalogOptionLabel,
	effortOptionsFor,
	showFastFor,
} from "./model-slot-options.ts";
import type { ModelPickMode, SlotDraft } from "./model-slot-options.ts";
import { useSlotForm, useSlotFormHandlers } from "./use-model-slot-form.ts";
import type { SlotFormState } from "./use-model-slot-form.ts";

type PatchDraft = (partial: Partial<SlotDraft>) => void;

function LoginSelect(props: {
	accounts: readonly VaultAccountMeta[];
	onChange: (accountId: string) => void;
	value: string | undefined;
}): ReactNode {
	return (
		<Select
			label={msg.models_login()}
			{...(props.value === undefined ? {} : { value: props.value })}
			onChange={(key) => {
				if (typeof key === "string") {
					props.onChange(key);
				}
			}}
			options={props.accounts.map((account) => ({
				id: account.id,
				label: msg.models_login_option({
					engine: account.engine,
					label: account.label,
				}),
			}))}
		/>
	);
}

function CatalogModelSelect(props: {
	catalogModels: readonly CatalogModel[];
	model: string;
	onPick: (model: string) => void;
	patch: PatchDraft;
}): ReactNode {
	return (
		<div className="flex w-full flex-col items-start gap-1">
			<Select
				label={msg.models_brain()}
				{...(props.model.length === 0 ? {} : { value: props.model })}
				onChange={(key) => {
					if (typeof key === "string") {
						props.onPick(key);
					}
				}}
				options={props.catalogModels.map((entry) => ({
					id: entry.id,
					label: catalogOptionLabel(entry),
				}))}
			/>
			<Button
				className="text-sm"
				variant="ghost"
				onPress={() => {
					props.patch({ model: "", pickMode: "custom" });
				}}
			>
				{msg.models_type_name()}
			</Button>
		</div>
	);
}

function CustomModelField(props: {
	model: string;
	patch: PatchDraft;
}): ReactNode {
	return (
		<div className="flex w-full flex-col items-start gap-1">
			<TextField
				label={msg.models_brain_name()}
				value={props.model}
				onChange={(model) => {
					props.patch({ model });
				}}
				autoComplete="off"
				spellCheck={false}
			/>
			<Button
				className="text-sm"
				variant="ghost"
				onPress={() => {
					props.patch({ model: "", pickMode: "catalog" });
				}}
			>
				{msg.models_pick_list()}
			</Button>
		</div>
	);
}

function ModelPickField(props: {
	catalogModels: readonly CatalogModel[];
	engine: EngineKind | undefined;
	model: string;
	onPickCatalogModel: (model: string) => void;
	patch: PatchDraft;
	pickMode: ModelPickMode;
}): ReactNode {
	if (props.engine === undefined) {
		return undefined;
	}
	if (props.pickMode === "catalog") {
		return (
			<CatalogModelSelect
				catalogModels={props.catalogModels}
				model={props.model}
				onPick={props.onPickCatalogModel}
				patch={props.patch}
			/>
		);
	}
	return <CustomModelField model={props.model} patch={props.patch} />;
}

function SlotTuningFields(props: {
	catalogModels: readonly CatalogModel[];
	draft: SlotDraft;
	patch: PatchDraft;
	selectedEngine: EngineKind | undefined;
}): ReactNode {
	const { draft, patch, selectedEngine } = props;
	const selectedCatalogModel = props.catalogModels.find(
		(entry) => entry.id === draft.model,
	);
	return (
		<>
			{selectedEngine ? (
				<Select
					label={msg.models_effort()}
					value={draft.effort}
					onChange={(key) => {
						if (typeof key === "string") {
							patch({ effort: key });
						}
					}}
					options={effortOptionsFor(selectedCatalogModel)}
				/>
			) : undefined}
			{showFastFor({ engine: selectedEngine, entry: selectedCatalogModel }) ? (
				<Checkbox
					isSelected={draft.fast}
					onChange={(fast) => {
						patch({ fast });
					}}
				>
					{msg.models_go_zoom()}
				</Checkbox>
			) : undefined}
			<Checkbox
				isSelected={draft.similarModel}
				onChange={(similarModel) => {
					patch({ similarModel });
				}}
			>
				{msg.models_cousin()}
			</Checkbox>
		</>
	);
}

function SlotFormMessages(props: {
	form: SlotFormState;
	selectedEngine: EngineKind | undefined;
}): ReactNode {
	const catalogMessage = catalogMessageFor({
		catalogModels: props.form.catalogModels,
		engine: props.selectedEngine,
		pickMode: props.form.draft.pickMode,
		query: props.form.catalogQuery,
	});
	return (
		<>
			{catalogMessage === undefined ? undefined : (
				<p
					className={
						props.form.catalogQuery.isError
							? "text-scarf m-0 text-sm"
							: "text-ink/75 m-0 text-sm"
					}
				>
					{catalogMessage}
				</p>
			)}
			{props.form.error === undefined ? undefined : (
				<ErrorMessage>{props.form.error}</ErrorMessage>
			)}
		</>
	);
}

function SlotFormFooter(props: {
	accountsEmpty: boolean;
	form: SlotFormState;
	patch: PatchDraft;
	selectedEngine: EngineKind | undefined;
}): ReactNode {
	const { draft } = props.form;
	const saving = props.form.saveMutation.isPending;
	return (
		<>
			<TextField
				label={msg.models_nickname()}
				value={draft.label}
				onChange={(label) => {
					props.patch({ label });
				}}
				autoComplete="off"
			/>
			<Button
				isDisabled={
					props.form.selectedAccount === undefined ||
					draft.model.trim().length === 0 ||
					draft.label.trim().length === 0 ||
					saving ||
					props.accountsEmpty
				}
				type="submit"
			>
				{saving ? msg.models_saving() : msg.models_add()}
			</Button>
			<SlotFormMessages
				form={props.form}
				selectedEngine={props.selectedEngine}
			/>
		</>
	);
}

export function AddModelSlotForm(props: {
	accounts: readonly VaultAccountMeta[];
	githubUserId: string | undefined;
	onSaved: () => Promise<unknown>;
	slotsCount: number;
}): ReactNode {
	const form = useSlotForm(props);
	const { patch, pickAccount, pickCatalogModel, submit } =
		useSlotFormHandlers(form);
	const selectedEngine = form.selectedAccount?.engine;

	return (
		<form
			className="mt-6 flex max-w-[48ch] flex-col items-start gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<LoginSelect
				accounts={props.accounts}
				onChange={pickAccount}
				value={form.draft.accountId}
			/>
			<ModelPickField
				catalogModels={form.catalogModels}
				engine={selectedEngine}
				model={form.draft.model}
				onPickCatalogModel={pickCatalogModel}
				patch={patch}
				pickMode={form.draft.pickMode}
			/>
			<SlotTuningFields
				catalogModels={form.catalogModels}
				draft={form.draft}
				patch={patch}
				selectedEngine={selectedEngine}
			/>
			<SlotFormFooter
				accountsEmpty={props.accounts.length === 0}
				form={form}
				patch={patch}
				selectedEngine={selectedEngine}
			/>
		</form>
	);
}
