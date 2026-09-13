import { commentMarkdown } from "@hakasebot/core/domain.ts";
import type {
	CatalogModel,
	CommentMarkdown,
	EngineKind,
	ModelCatalog,
	ModelName,
} from "@hakasebot/core/domain.ts";

const NOISE_WORDS = new Set([
	"dated",
	"exp",
	"experimental",
	"latest",
	"models",
	"preview",
]);

export type CatalogView =
	| { kind: "listed"; models: readonly CatalogModel[] }
	| { kind: "unavailable"; detail: string };

export type ModelVerdict =
	| {
			basis: "listed" | "unchecked" | "unlisted-custom";
			kind: "as-stored";
			model: ModelName;
	  }
	| {
			kind: "substituted";
			model: ModelName;
			requested: ModelName;
	  }
	| {
			kind: "unresolved";
			requested: ModelName;
			wouldHaveUsed: ModelName;
	  };

interface ModelIdShape {
	version: readonly number[];
	words: readonly string[];
}

function tokenKind(char: string): "digit" | "letter" | undefined {
	if (char >= "0" && char <= "9") {
		return "digit";
	}
	if (char >= "a" && char <= "z") {
		return "letter";
	}
	return undefined;
}

function parseModelId(id: string): ModelIdShape {
	const lower = id.toLowerCase();
	const words: string[] = [];
	const version: number[] = [];
	let current = "";
	let kind: "digit" | "letter" | undefined;
	const flush = (): void => {
		if (current.length === 0 || kind === undefined) {
			current = "";
			kind = undefined;
			return;
		}
		if (kind === "digit") {
			if (current.length < 6) {
				version.push(Number(current));
			}
		} else if (!NOISE_WORDS.has(current)) {
			words.push(current);
		}
		current = "";
		kind = undefined;
	};
	for (const char of lower) {
		const next = tokenKind(char);
		if (next === undefined) {
			flush();
			continue;
		}
		if (kind !== undefined && next !== kind) {
			flush();
		}
		kind = next;
		current += char;
	}
	flush();
	return {
		version,
		words: [...words].toSorted(),
	};
}

function sameFamily(left: ModelIdShape, right: ModelIdShape): boolean {
	if (left.words.length === 0 || left.words.length !== right.words.length) {
		return false;
	}
	return left.words.every((word, index) => word === right.words[index]);
}

function compareVersion(
	left: readonly number[],
	right: readonly number[],
): number {
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		if (leftValue !== rightValue) {
			return leftValue - rightValue;
		}
	}
	return 0;
}

export function pickSimilarModel(args: {
	models: readonly CatalogModel[];
	requested: ModelName;
}): ModelName | undefined {
	const requested = parseModelId(args.requested);
	if (requested.words.length === 0 || requested.version.length === 0) {
		return undefined;
	}
	let best: { id: ModelName; version: readonly number[] } | undefined;
	for (const item of args.models) {
		if (item.id === args.requested) {
			continue;
		}
		const candidate = parseModelId(item.id);
		if (!sameFamily(requested, candidate)) {
			continue;
		}
		if (
			best === undefined ||
			compareVersion(candidate.version, best.version) > 0 ||
			(compareVersion(candidate.version, best.version) === 0 &&
				item.id > best.id)
		) {
			best = { id: item.id, version: candidate.version };
		}
	}
	return best?.id;
}

export function judgeModel(args: {
	catalog: CatalogView;
	requested: ModelName;
	similarModel: boolean;
}): ModelVerdict {
	if (args.catalog.kind === "unavailable") {
		return {
			basis: "unchecked",
			kind: "as-stored",
			model: args.requested,
		};
	}
	if (args.catalog.models.some((item) => item.id === args.requested)) {
		return {
			basis: "listed",
			kind: "as-stored",
			model: args.requested,
		};
	}
	const used = pickSimilarModel({
		models: args.catalog.models,
		requested: args.requested,
	});
	if (used === undefined) {
		return {
			basis: "unlisted-custom",
			kind: "as-stored",
			model: args.requested,
		};
	}
	if (args.similarModel) {
		return {
			kind: "substituted",
			model: used,
			requested: args.requested,
		};
	}
	return {
		kind: "unresolved",
		requested: args.requested,
		wouldHaveUsed: used,
	};
}

export function similarModelNotice(args: {
	requested: ModelName;
	used: ModelName;
}): CommentMarkdown {
	return commentMarkdown(
		`this review used ${args.used} because ${args.requested} went away.`,
	);
}

export function similarModelFailureMessage(
	verdict: Extract<ModelVerdict, { kind: "unresolved" }>,
): string {
	return `${verdict.requested} went away and you said no cousins. ${verdict.wouldHaveUsed} is still around.`;
}

export function catalogViewFor(
	catalogs: Partial<Record<EngineKind, ModelCatalog>>,
	engine: EngineKind,
): CatalogView {
	const catalog = catalogs[engine];
	if (catalog === undefined) {
		return { detail: "model catalog is missing", kind: "unavailable" };
	}
	return { kind: "listed", models: catalog.models };
}
