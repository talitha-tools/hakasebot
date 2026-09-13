import { readFile } from "node:fs/promises";
import path from "node:path";

import { generateEncryptionKey } from "@hakasebot/core/vault/crypto.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { VaultGateView } from "#/lab/vault-gate.tsx";
import { EncryptionKeyExportBlock } from "#/web-app/views/encryption-key-block.tsx";
import { RotatePreview } from "#/web-app/views/rotate-preview.tsx";

function renderMarkup(element: ReactElement): string {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return renderToStaticMarkup(
		createElement(QueryClientProvider, { client }, element),
	);
}

describe("vault gate copy", () => {
	test("ceremony asks for one save tick before entry", () => {
		const key = generateEncryptionKey();
		const markup = renderMarkup(
			createElement(VaultGateView, {
				gate: { kind: "ceremony", key },
				onOpened: () => {
					/* empty */
				},
				snapshot: {
					accountCount: 0,
					epoch: undefined,
					githubUserId: "1",
					sample: undefined,
				},
			}),
		);

		expect(markup).toContain("i wrote it down. somewhere safe!!");
		expect(markup).not.toContain("i copied or wrote down this key");
		expect(markup).toContain("i have the key. let me in!!");
	});

	test("import gate offers reset accounts recovery", () => {
		const markup = renderMarkup(
			createElement(VaultGateView, {
				gate: { kind: "import" },
				onOpened: () => {
					/* empty */
				},
				snapshot: {
					accountCount: 1,
					epoch: 1,
					githubUserId: "1",
					sample: undefined,
				},
			}),
		);

		expect(markup).toContain("the boxes are locked!!");
		expect(markup).toContain("reset accounts");
		expect(markup).toContain("lost the key??");
		expect(markup).not.toContain("i wrote it down. somewhere safe!!");
	});
});

describe("settings key export", () => {
	test("has no save tick boxes", () => {
		const markup = renderMarkup(
			createElement(EncryptionKeyExportBlock, {
				githubUserId: undefined,
			}),
		);

		expect(markup).toContain("the key!! keep it!!");
		expect(markup).not.toContain("i copied or wrote down this key");
		expect(markup).not.toContain("i wrote it down. somewhere safe!!");
	});

	test("source does not import a checkbox", async () => {
		const source = await readFile(
			path.join(
				import.meta.dirname,
				"..",
				"src",
				"web-app",
				"views",
				"encryption-key-block.tsx",
			),
			"utf8",
		);
		expect(source).not.toContain("Checkbox");
	});
});

describe("rotate preview", () => {
	test("uses the confirm label from the caller", () => {
		const markup = renderMarkup(
			createElement(RotatePreview, {
				busy: false,
				confirmLabel: "wipe them, new key",
				onCancel: () => {
					/* empty */
				},
				onConfirm: () => {
					/* empty */
				},
				preview: {
					accountCount: 2,
					enabledRepoCount: 0,
					overrideCount: 0,
					repos: [],
					slotCount: 1,
				},
			}),
		);

		expect(markup).toContain("wipe them, new key");
		expect(markup).toContain("2");
		expect(markup).toContain("logins");
	});
});
