# Install Matt Pocock code-review skill into job HOME

Two-axis review guidance belongs in the upstream skill, not a forked copy in `buildReviewPrompt`.

**Decision.** For review Engine passes, after creating the job-local HOME, run `bunx skills add mattpocock/skills --skill code-review --agent '*' -g -y --copy` with `HOME` set to that directory and an allowlisted child env (same seam as Engine spawns: PATH/proxy/locale plus `DO_NOT_TRACK`, not the full parent `process.env`). Override the skills CLI binary via the product-prefixed skills-bin env key for tests (same install argv after `add`; default stays `bunx skills`). Thin axis prompts tell the model to follow the installed skill for that axis only, supply a non-interactive fixed point (PR merge-base), skip spawning further sub-agents (ReviewRuntime already runs Standards and Spec in parallel), and emit GitHub `note`/`patch` JSON. Mention and fix do not install the skill.

Inlining the smell baseline was rejected. Runner-user installs without setting job HOME were rejected (engines never see them). `skills use` prompt injection without install was rejected: discovery paths stay real so agents that load skills from disk keep working. Spreading full `process.env` into the skills install was rejected: Action secrets must not ride along.
