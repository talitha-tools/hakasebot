# Review instructions are prompt plus ignore plus consumer notes file

There is no place to say "stop nitting changelog". The Engine prompt is otherwise a product-owned string.

**Decision.** Each enabled repo may store a prompt string and ignore path globs in D1. The Home job also reads `.hakasebot.md` from the consumer checkout when that file exists (same stem as the review HTML marker). All three go into the Engine prompt. Ignore globs are instructions to skip those paths, not a second checkout filter.

Prompt-only in D1 was rejected: people already keep review notes in the consumer repo. File-only was rejected: the first request often comes from the Dashboard before anyone adds a file. Filtering the git diff was rejected: the CLIs see the working tree; prompt ignore is the seam we already own.
