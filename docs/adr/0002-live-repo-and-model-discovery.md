# Lab discovers repos and models live

Users must not hand-type repo owner/name as the primary path, and must not pick models from hardcoded defaults that rot.

**Decision.** The Lab uses a Repo picker of repositories the Hosted bot App already grants (ADR-0025). Model options and the default come from the Deployment Model catalog (ADR-0032). Custom string is the fallback when the list is missing or the id is unpublished.

**Rejected.** Prefill-owner-but-still-type-name as the main UX. A hand-edited model table as source of truth. Decrypting vault credentials on the Worker to list models.
