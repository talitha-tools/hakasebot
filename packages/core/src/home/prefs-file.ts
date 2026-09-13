import { z } from "zod";

import { effort, engineKind, modelName, repoRef } from "#/domain.ts";
import type { ParseResult, RepoRef } from "#/domain.ts";
import { unknownText } from "#/is-record.ts";
import { accountId, modelSlotId } from "#/vault/domain.ts";
import type { ModelSlot } from "#/vault/model-slot.ts";
import { similarModelOption } from "#/vault/model-slot.ts";
import {
	fromParseResult,
	parseJsonText,
	parseUnknown,
	trueFlagSchema,
} from "#/zod-parse.ts";

export interface HomeRepoAllowlist {
	repo: RepoRef;
	slotIds: readonly string[] | undefined;
	prompt?: string;
	ignorePaths?: readonly string[];
}

export interface HomePrefsFile {
	repos: readonly HomeRepoAllowlist[];
	slots: readonly ModelSlot[];
	version: 1;
}

export function serializeHomePrefs(prefs: HomePrefsFile): string {
	return `${JSON.stringify(
		{
			repos: prefs.repos.map((row) => ({
				repo: {
					id: row.repo.id,
					name: row.repo.name,
					owner: row.repo.owner,
				},
				// oxlint-disable-next-line unicorn/no-null -- prefs JSON wire format: null slotIds means "all slots"
				slotIds: row.slotIds ?? null,
				...(row.prompt === undefined ? {} : { prompt: row.prompt }),
				...(row.ignorePaths === undefined
					? {}
					: { ignorePaths: row.ignorePaths }),
			})),
			slots: prefs.slots,
			version: 1,
		},
		undefined,
		2,
	)}\n`;
}

const coercedText = z.unknown().transform((value) => unknownText(value));

const prefsSlotIdsSchema = z.object({
	accountId: fromParseResult(coercedText, accountId),
	engine: fromParseResult(coercedText, engineKind),
	id: fromParseResult(coercedText, modelSlotId),
	model: fromParseResult(coercedText, modelName),
});

const prefsSlotMetaSchema = z.object({
	createdAt: z.number({
		error: "runtime pack prefs slot createdAt is invalid",
	}),
	defaultSortIndex: z
		.number({ error: "runtime pack prefs slot sort is invalid" })
		.int({ error: "runtime pack prefs slot sort is invalid" }),
	label: z
		.string({ error: "runtime pack prefs slot label is empty" })
		.transform((value, ctx) => {
			if (value.trim().length === 0) {
				ctx.addIssue({
					code: "custom",
					message: "runtime pack prefs slot label is empty",
				});
				return z.NEVER;
			}
			return value;
		}),
});

const prefsSlotEffortSchema = z
	.unknown()
	.optional()
	.transform((raw, ctx) => {
		if (raw === undefined || raw === null) {
			return;
		}
		const parsed = effort(unknownText(raw));
		if (parsed.kind === "invalid") {
			ctx.addIssue({ code: "custom", message: parsed.message });
			return z.NEVER;
		}
		return parsed.value;
	});

const prefsSlotSchema: z.ZodType<ModelSlot> = z
	.object(
		{
			...prefsSlotIdsSchema.shape,
			...prefsSlotMetaSchema.shape,
			effort: prefsSlotEffortSchema,
			fast: trueFlagSchema,
			similarModel: z
				.unknown()
				.optional()
				.transform((raw) => similarModelOption(raw)),
		},
		{ error: "runtime pack prefs slot is invalid" },
	)
	.transform((item) => ({
		accountId: item.accountId,
		createdAt: item.createdAt,
		defaultSortIndex: item.defaultSortIndex,
		engine: item.engine,
		fast: item.fast,
		id: item.id,
		label: item.label,
		model: item.model,
		similarModel: item.similarModel,
		...(item.effort === undefined ? {} : { effort: item.effort }),
	}));

const repoIdSchema = z.union([z.string(), z.number()]);

const prefsRepoRefObjectSchema = z.object(
	{
		id: repoIdSchema,
		name: z.string(),
		owner: z.string(),
	},
	{ error: "runtime pack prefs repo row is invalid" },
);

const prefsRepoRefSchema = fromParseResult(prefsRepoRefObjectSchema, repoRef);

const prefsSlotIdsListSchema = z
	.union([z.array(z.string()), z.null()], {
		error: "runtime pack prefs slotIds is invalid",
	})
	.optional()
	.transform((raw) => raw ?? undefined);

const prefsRepoRowSchema: z.ZodType<HomeRepoAllowlist> = z
	.object(
		{
			ignorePaths: z
				.array(z.string(), {
					error: "runtime pack prefs ignorePaths is invalid",
				})
				.optional(),
			prompt: z
				.string({ error: "runtime pack prefs prompt is invalid" })
				.optional(),
			repo: prefsRepoRefSchema,
			slotIds: prefsSlotIdsListSchema,
		},
		{ error: "runtime pack prefs repo row is invalid" },
	)
	.transform((item) => ({
		repo: item.repo,
		slotIds: item.slotIds,
		...(item.prompt === undefined ? {} : { prompt: item.prompt }),
		...(item.ignorePaths === undefined
			? {}
			: { ignorePaths: item.ignorePaths }),
	}));

const homePrefsSchema: z.ZodType<HomePrefsFile> = z.object(
	{
		repos: z.array(prefsRepoRowSchema, {
			error: "runtime pack prefs repos must be an array",
		}),
		slots: z.array(prefsSlotSchema, {
			error: "runtime pack prefs slots must be an array",
		}),
		version: z.literal(1, {
			error: "runtime pack prefs version is unsupported",
		}),
	},
	{ error: "runtime pack prefs version is unsupported" },
);

export function parseHomePrefsValue(
	parsed: unknown,
): ParseResult<HomePrefsFile> {
	return parseUnknown(homePrefsSchema, parsed);
}

export function parseHomePrefs(raw: string): ParseResult<HomePrefsFile> {
	return parseJsonText(
		homePrefsSchema,
		raw,
		"runtime pack prefs is not valid JSON",
	);
}
