import { engineKind } from "@hakasebot/core/domain.ts";
import type { EngineKind } from "@hakasebot/core/domain.ts";
import type { VaultAccountMeta } from "@hakasebot/core/vault/domain.ts";
import { oauthEngine } from "@hakasebot/core/vendor-login.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import { Select } from "#/components/ui/select.tsx";
import { TextAreaField } from "#/components/ui/text-area.tsx";
import { TextField } from "#/components/ui/text-field.tsx";
import { credentialFieldFor, ENGINE_OPTIONS } from "#/lab/constants.ts";
import { m as msg } from "#/paraglide/messages.js";
import {
	deleteVaultAccountFn,
	listVaultAccountsFn,
} from "#/web-app/accounts-rpc.ts";
import { webAppSnapshotFn } from "#/web-app/snapshot-rpc.ts";

import { useAddAccountForm } from "./use-account-form.ts";
import { VendorLoginBlock } from "./vendor-login-block.tsx";

function AccountRow(props: {
	account: VaultAccountMeta;
	busy: boolean;
	onDelete: (id: string) => void;
}): ReactNode {
	return (
		<li className="border-ink flex flex-wrap items-center justify-between gap-2 border-2 px-3 py-2">
			<div>
				<p className="text-ink m-0 font-bold">{props.account.label}</p>
				<p className="text-ink/60 m-0 text-sm">
					{props.account.engine} · {props.account.id}
				</p>
			</div>
			<Button
				variant="ghost"
				isDisabled={props.busy}
				onPress={() => {
					props.onDelete(props.account.id);
				}}
			>
				{msg.accounts_delete()}
			</Button>
		</li>
	);
}

function AccountList(props: {
	accounts: readonly VaultAccountMeta[];
	busy: boolean;
	onDelete: (id: string) => void;
	pending: boolean;
}): ReactNode {
	if (props.pending) {
		return <p className="text-ink/50 m-0 mt-2">{msg.accounts_looking()}</p>;
	}
	if (props.accounts.length === 0) {
		return <p className="text-ink/50 m-0 mt-2">{msg.accounts_empty()}</p>;
	}
	return (
		<ul className="mt-3 flex flex-col gap-2">
			{props.accounts.map((account) => (
				<AccountRow
					account={account}
					busy={props.busy}
					key={account.id}
					onDelete={props.onDelete}
				/>
			))}
		</ul>
	);
}

function EngineSelect(props: {
	engine: EngineKind;
	onChange: (engine: EngineKind) => void;
}): ReactNode {
	return (
		<Select
			label={msg.accounts_which_brain()}
			value={props.engine}
			onChange={(key) => {
				if (typeof key !== "string") {
					return;
				}
				const parsed = engineKind(key);
				if (parsed.kind === "ok") {
					props.onChange(parsed.value);
				}
			}}
			options={ENGINE_OPTIONS.map((option) => ({
				id: option.kind,
				label: option.label,
			}))}
		/>
	);
}

function CredentialField(props: {
	busy: boolean;
	draft: string;
	engine: EngineKind;
	onChange: (value: string) => void;
}): ReactNode {
	const field = credentialFieldFor(props.engine);
	return (
		<TextAreaField
			label={field.label}
			description={field.hint}
			value={props.draft}
			onChange={props.onChange}
			rows={4}
			autoComplete="off"
			spellCheck={false}
		/>
	);
}

/** OAuth engines log in; cursor stays paste-only. */
function AccountCredentials(props: {
	busy: boolean;
	draft: string;
	engine: EngineKind;
	loginRemountKey: number;
	onDraft: (value: string) => void;
}): ReactNode {
	const oauth = oauthEngine(props.engine);
	return (
		<>
			{oauth === undefined ? undefined : (
				<VendorLoginBlock
					key={`${oauth}:${String(props.loginRemountKey)}`}
					engine={oauth}
					onCredential={props.onDraft}
				/>
			)}
			{oauth === undefined ? (
				<CredentialField
					busy={props.busy}
					draft={props.draft}
					engine={props.engine}
					onChange={props.onDraft}
				/>
			) : undefined}
		</>
	);
}

function AddAccountForm(props: {
	githubUserId: string | undefined;
	onSaved: () => Promise<void>;
}): ReactNode {
	const {
		busy,
		draft,
		engine,
		error,
		label,
		loginRemountKey,
		setDraft,
		setEngine,
		setLabel,
		submit,
	} = useAddAccountForm(props.githubUserId, props.onSaved);

	return (
		<form
			className="mt-6 flex max-w-[48ch] flex-col items-start gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<EngineSelect engine={engine} onChange={setEngine} />
			<TextField
				label={msg.accounts_nickname()}
				value={label}
				onChange={setLabel}
				autoComplete="off"
			/>
			<AccountCredentials
				busy={busy}
				draft={draft}
				engine={engine}
				loginRemountKey={loginRemountKey}
				onDraft={setDraft}
			/>
			<Button
				isDisabled={
					label.trim().length === 0 || draft.trim().length === 0 || busy
				}
				type="submit"
			>
				{busy ? msg.accounts_locking() : msg.accounts_lock()}
			</Button>
			{error === undefined ? undefined : <ErrorMessage>{error}</ErrorMessage>}
		</form>
	);
}

function useVaultAccounts(githubUserId: string | undefined) {
	const queryClient = useQueryClient();
	const accountsQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => listVaultAccountsFn(),
		queryKey: ["vault", githubUserId, "accounts"],
	});

	const invalidateVaultAccounts = async () => {
		await queryClient.invalidateQueries({
			queryKey: ["vault", githubUserId, "accounts"],
		});
		await queryClient.invalidateQueries({
			queryKey: ["web-app", "snapshot"],
		});
	};

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			await deleteVaultAccountFn({ data: { id } });
		},
		onSuccess: async () => {
			await invalidateVaultAccounts();
			await queryClient.invalidateQueries({
				queryKey: ["vault", githubUserId, "model-slots"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["web-app", "repo-slots"],
			});
		},
	});

	return {
		accounts: accountsQuery.data ?? [],
		deleteAccount: (id: string) => {
			deleteMutation.mutate(id);
		},
		deleting: deleteMutation.isPending,
		invalidateVaultAccounts,
		pending: accountsQuery.isPending,
	};
}

export function AccountsPanel(): ReactNode {
	const snapshotQuery = useQuery({
		queryFn: async () => webAppSnapshotFn(),
		queryKey: ["web-app", "snapshot"],
		staleTime: 30_000,
	});
	const githubUserId = snapshotQuery.data?.githubUserId;
	const {
		accounts,
		deleteAccount,
		deleting,
		invalidateVaultAccounts,
		pending,
	} = useVaultAccounts(githubUserId);

	return (
		<Section>
			<Label>{msg.accounts_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.accounts_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">
				{msg.accounts_intro()}
			</p>
			<AddAccountForm
				githubUserId={githubUserId}
				onSaved={invalidateVaultAccounts}
			/>
			<div className="mt-8">
				<h3 className="text-ink m-0 text-lg font-bold">
					{msg.accounts_locked_in()}
				</h3>
				<AccountList
					accounts={accounts}
					busy={deleting}
					onDelete={deleteAccount}
					pending={pending}
				/>
			</div>
		</Section>
	);
}
