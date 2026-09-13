export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined;
}

export function readString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/** Stringify unknown JSON/D1 fields without `${object}` default conversion. */
export function unknownText(value: unknown): string {
	switch (typeof value) {
		case "string": {
			return value;
		}
		case "number":
		case "boolean":
		case "bigint":
		case "symbol":
		case "function": {
			return value.toString();
		}
		case "undefined": {
			return "";
		}
		case "object": {
			if (value === null) {
				return "";
			}
			if (Array.isArray(value)) {
				return value.map((item: unknown) => unknownText(item)).join(",");
			}
			return Object.prototype.toString.call(value);
		}
		default: {
			return "";
		}
	}
}
