import { pullNumber } from "@hakasebot/core/domain.ts";
import { runUrl } from "@hakasebot/core/wake/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { LastWakeView } from "#/web-app/views/last-wake.tsx";

const failedPullNumber = must(pullNumber(42));
const startedPullNumber = must(pullNumber(43));
const startedRunUrl = must(
	runUrl("https://github.com/octo/home/actions/runs/1"),
);

describe("LastWakeView", () => {
	test("shows a wake that failed to start", () => {
		const markup = renderToStaticMarkup(
			createElement(LastWakeView, {
				lastWake: {
					createdAt: Date.parse("2026-05-01T00:00:00.000Z"),
					pullNumber: failedPullNumber,
					runUrl: undefined,
					status: "failed",
				},
			}),
		);

		expect(markup).toContain("flopped");
		expect(markup).toContain("2026-05-01T00:00:00.000Z");
		expect(markup).toContain("PR #42");
		expect(markup).not.toContain("<a");
	});

	test("links a wake that started", () => {
		const markup = renderToStaticMarkup(
			createElement(LastWakeView, {
				lastWake: {
					createdAt: Date.parse("2026-05-01T00:00:00.000Z"),
					pullNumber: startedPullNumber,
					runUrl: startedRunUrl,
					status: "dispatched",
				},
			}),
		);

		expect(markup).toContain("it looked!!");
		expect(markup).toContain(
			'href="https://github.com/octo/home/actions/runs/1"',
		);
	});

	test("shows an empty state", () => {
		const markup = renderToStaticMarkup(
			createElement(LastWakeView, { lastWake: undefined }),
		);

		expect(markup).toContain("hasn&#x27;t looked yet");
	});

	test("maps an unknown status through the catalog", () => {
		const markup = renderToStaticMarkup(
			createElement(LastWakeView, {
				lastWake: {
					createdAt: Date.parse("2026-05-01T00:00:00.000Z"),
					pullNumber: failedPullNumber,
					runUrl: undefined,
					status: "in_progress",
				},
			}),
		);

		expect(markup).toContain("in_progress");
		expect(markup).not.toContain("flopped");
		expect(markup).not.toContain("it looked!!");
	});
});
