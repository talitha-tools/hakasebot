# Report checks drop unpostable findings after schema validation

Zod on `review-report.json` (ADR-0018) only enforces wire shape. Ignore globs, line bounds, and "this line is in the pull diff" would otherwise stay prompt-only, so a valid report can 422 on create-review or comment on files the User asked to skip.

**Decision.** After schema validation, the Review runtime runs Report checks: deterministic filters on the branded report. Findings that fail a check are dropped; the pass still posts. Schema failure still fails the pass.

Shipped checks: unsafe relative path, ignore-glob match, missing file or out-of-range lines, lines not on the pull head (GitHub right-side), no-op patch (replacement equals the cited text). Voice, smells, and Spec judgement stay in the Engine.

Failing the job on a bad finding was rejected: one invented path would swallow a real review. Filtering the consumer checkout (ADR-0009) stays rejected; ignore globs still go in the prompt, and the check is a second seam on the report. Fetching pull files is fail-open: if the list cannot be loaded, skip the in-diff check rather than drop everything.
