const STORAGE_KEY = "hakasebot:host-console-token";

export function loadHostConsoleToken(): string | undefined {
	const token = sessionStorage.getItem(STORAGE_KEY);
	return token ?? undefined;
}

export function saveHostConsoleToken(token: string): void {
	sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearHostConsoleToken(): void {
	sessionStorage.removeItem(STORAGE_KEY);
}
