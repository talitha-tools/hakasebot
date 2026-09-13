import { generateEncryptionKey } from "@hakasebot/core/vault/crypto.ts";
import { afterEach, describe, expect, test, vi } from "vitest";

import { downloadEncryptionKey } from "#/vault/download-key.ts";

const documentDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"document",
);

describe("downloadEncryptionKey", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		if (documentDescriptor === undefined) {
			Reflect.deleteProperty(globalThis, "document");
		} else {
			Object.defineProperty(globalThis, "document", documentDescriptor);
		}
	});

	test("downloads the raw key as the-key.txt", async () => {
		const key = generateEncryptionKey();
		const anchor = {
			click: vi.fn(),
			download: "",
			href: "",
		};
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: {
				cookie: "",
				createElement: vi.fn(() => anchor),
			},
		});
		const createObjectUrl = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:encryption-key");
		const revokeObjectUrl = vi
			.spyOn(URL, "revokeObjectURL")
			.mockReturnValue(undefined);

		downloadEncryptionKey(key);

		const blob = createObjectUrl.mock.calls[0]?.[0];
		expect(blob).toBeInstanceOf(Blob);
		if (!(blob instanceof Blob)) {
			throw new TypeError("download payload is not a Blob");
		}
		await expect(blob.text()).resolves.toBe(key);
		expect(anchor.download).toBe("the-key.txt");
		expect(anchor.href).toBe("blob:encryption-key");
		expect(anchor.click).toHaveBeenCalledOnce();
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:encryption-key");
	});
});
