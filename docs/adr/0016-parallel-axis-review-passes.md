# Review axes run as parallel Engine passes

Matt Pocock's code-review skill treats Standards and Spec as separate contexts. Collapsing them into one Engine prompt lets the axes pollute each other.

**Decision.** For `plan.kind === "review"`, ReviewRuntime runs two Engine passes in parallel, one Standards and one Spec, each with its own prompt and job-local HOME. Findings stay `note` / `patch` JSON. The runtime merges summaries under `## Standards` and `## Spec` and concatenates findings without cross-axis reranking. Mention and fix stay a single pass.

One combined pass was rejected: the axes pollute each other. Cursor Task sub-agents were rejected: the Review runtime only has Engine CLIs on Actions. Skipping Spec when no source exists still runs the Spec pass so it can report "no spec available".
