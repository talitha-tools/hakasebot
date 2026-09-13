# Engine review report is a file plus Zod validation

Stdout JSON scraping is soft: engines chatter, and a prompt-only schema only fails after the fact with weak errors.

**Decision.** Each Engine pass writes `review-report.json` under its job-local HOME. The prompt names that absolute path and the wire schema. After a successful exit, the runtime reads the file and validates with a Zod `.strict()` discriminated union (`note` | `patch`) before domain branding. If the file is missing, fall back once to normalized engine stdout (for CLIs that only emit structured stdout, for example antigravity with `--json-schema`); if that also fails schema, the pass fails. Antigravity still receives `--json-schema` aligned with the same shape.

Prompt-only schema without a file was rejected. Adding Ajv was rejected: Zod is already a dependency. Stdout-only as the primary source was rejected; stdout remains a fallback only.
