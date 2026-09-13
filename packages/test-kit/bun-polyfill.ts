/**
 * Node stand-in for Bun.* used by Action modules under Vitest.
 */
import {
	spawn as nodeSpawn,
	spawnSync as nodeSpawnSync,
} from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { once } from "node:events";
import { accessSync, constants } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

class CryptoHasher {
	readonly #hasher:
		| ReturnType<typeof createHash>
		| ReturnType<typeof createHmac>;

	public constructor(algorithm: string, key?: string | ArrayBufferView) {
		if (key === undefined) {
			this.#hasher = createHash(algorithm);
			return;
		}
		const material =
			typeof key === "string"
				? key
				: Buffer.from(key.buffer, key.byteOffset, key.byteLength);
		this.#hasher = createHmac(algorithm, material);
	}

	public update(data: string | ArrayBufferView): this {
		const material =
			typeof data === "string"
				? data
				: Buffer.from(data.buffer, data.byteOffset, data.byteLength);
		this.#hasher.update(material);
		return this;
	}

	public digest(encoding: "hex" | "base64" | "base64url"): string;
	public digest(): Uint8Array;
	public digest(
		encoding?: "hex" | "base64" | "base64url",
	): Uint8Array | string {
		if (encoding === undefined) {
			return new Uint8Array(this.#hasher.digest());
		}
		return this.#hasher.digest(encoding);
	}
}

function whichBinary(
	binary: string,
	options?: { PATH?: string },
): string | null {
	const pathEnv = options?.PATH ?? process.env["PATH"] ?? "";
	for (const segment of pathEnv.split(":")) {
		if (segment.length === 0) {
			continue;
		}
		const candidate = path.join(segment, binary);
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			continue;
		}
	}
	return null; // oxlint-disable-line unicorn/no-null -- Bun.which contract
}

function nodeStreamToWeb(
	stream: Readable | undefined,
): WebReadableStream<Uint8Array> | undefined {
	if (stream === undefined) {
		return undefined;
	}
	return Readable.toWeb(stream);
}

function eventArg(value: unknown): unknown {
	if (!Array.isArray(value) || value.length === 0) {
		return undefined;
	}
	return value.at(0);
}

async function writeBytes(
	filePath: string,
	data: string | ArrayBufferView | Blob,
): Promise<number> {
	if (data instanceof Blob) {
		const buffer = await data.arrayBuffer();
		await writeFile(filePath, Buffer.from(buffer));
		return buffer.byteLength;
	}
	const bytes =
		typeof data === "string"
			? Buffer.from(data)
			: Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	await writeFile(filePath, bytes);
	return bytes.byteLength;
}

export function installBunPolyfill(): void {
	if ((globalThis as typeof globalThis & { Bun?: unknown }).Bun !== undefined) {
		return;
	}
	const bun = {
		CryptoHasher,
		file(filePath: string) {
			return {
				text: async (): Promise<string> => readFile(filePath, "utf8"),
				stat: async () => stat(filePath),
				exists: async (): Promise<boolean> => {
					try {
						await stat(filePath);
						return true;
					} catch {
						return false;
					}
				},
			};
		},
		write: writeBytes,
		which: whichBinary,
		spawn(
			cmd: string[],
			options?: {
				cwd?: string;
				env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
				stdin?: "ignore" | "pipe";
				stdout?: "ignore" | "pipe";
				stderr?: "ignore" | "pipe";
			},
		) {
			const [binary, ...argv] = cmd;
			if (binary === undefined) {
				throw new Error("Bun.spawn requires a command");
			}
			const child = nodeSpawn(binary, argv, {
				cwd: options?.cwd,
				env: options?.env,
				stdio: [
					options?.stdin === "pipe" ? "pipe" : "ignore",
					options?.stdout === "ignore" ? "ignore" : "pipe",
					options?.stderr === "ignore" ? "ignore" : "pipe",
				],
			});
			const exited = (async (): Promise<number> => {
				const closed = once(child, "close");
				const failed = once(child, "error");
				const winner = await Promise.race([
					closed.then((args) => ({ kind: "close" as const, args })),
					failed.then((args) => ({ kind: "error" as const, args })),
				]);
				if (winner.kind === "error") {
					const error = eventArg(winner.args);
					throw error instanceof Error ? error : new Error("spawn failed");
				}
				const code = eventArg(winner.args);
				return typeof code === "number" ? code : 1;
			})();
			const stdoutStream =
				options?.stdout === "ignore"
					? undefined
					: nodeStreamToWeb(child.stdout ?? undefined);
			const stderrStream =
				options?.stderr === "ignore"
					? undefined
					: nodeStreamToWeb(child.stderr ?? undefined);
			return {
				exited,
				stdout: stdoutStream ?? null, // oxlint-disable-line unicorn/no-null -- Bun.spawn stdout contract
				stderr: stderrStream ?? null, // oxlint-disable-line unicorn/no-null -- Bun.spawn stderr contract
			};
		},
		spawnSync(
			cmd: string[],
			options?: {
				cwd?: string;
				stdout?: "ignore" | "pipe";
				stderr?: "ignore" | "pipe";
			},
		) {
			const [binary, ...argv] = cmd;
			if (binary === undefined) {
				throw new Error("Bun.spawnSync requires a command");
			}
			const result = nodeSpawnSync(binary, argv, {
				cwd: options?.cwd,
				encoding: "buffer",
				stdio: [
					"ignore",
					options?.stdout === "ignore" ? "ignore" : "pipe",
					options?.stderr === "ignore" ? "ignore" : "pipe",
				],
			});
			const stdout =
				result.stdout instanceof Buffer ? result.stdout : Buffer.from("");
			const stderr =
				result.stderr instanceof Buffer ? result.stderr : Buffer.from("");
			return {
				exitCode: result.status ?? 1,
				stdout,
				stderr,
			};
		},
	};
	Object.defineProperty(globalThis, "Bun", {
		configurable: true,
		enumerable: false,
		value: bun,
		writable: false,
	});
}
