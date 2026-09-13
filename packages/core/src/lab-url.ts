/**
 * Lab origin from a raw env record (`VITE_LAB_URL`). Pure: the Action reads
 * this without evaluating the web app's validated env.
 */
export function labUrlFromEnvRecord(
	record: Record<string, string | undefined>,
): string | undefined {
	const fromEnv = record["VITE_LAB_URL"];
	if (fromEnv === undefined || fromEnv.length === 0) {
		return undefined;
	}
	return fromEnv;
}
