export function extractJsonStdout(stdout: string): string {
	const trimmed = stdout.trim();
	if (trimmed.startsWith("{") && !trimmed.includes("\n{")) {
		return trimmed;
	}
	const match = /\{[\s\S]*\}/u.exec(trimmed);
	return match === null ? trimmed : match[0];
}
