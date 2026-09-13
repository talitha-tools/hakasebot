# Deployment Model catalog in KV

The picker and similar-model option both need a live list of model ids. Vendor list calls must not use vault plaintext.

**Decision.** The Worker GETs each Engine's official models endpoint with a Deployment secret, stores the parsed list in KV, and serves that list to Lab and to the Runtime pack. A hit younger than 24 hours returns as-is. A hit older than 24 hours still returns, and the request schedules a refresh with `waitUntil`. A miss fetches in the request. Custom strings stay the escape hatch. Vault credentials stay for Engine spawn only.

KV key `catalog:v1:<engine>` holds `{ fetchedAt, catalog }`. No TTL on the key. Freshness is `fetchedAt`. The operator can delete those keys from `/host`. The next catalog read is a miss fetch.

The Runtime pack carries the catalogs for engines in the slot queue. The Action judges against that snapshot. A missing catalog is treated as a failed list: run the stored id (ADR-0011).

xAI refuses `GET /v1/models` until the team has prepaid credits. The list call does not spend them. Mint `CATALOG_XAI_API_KEY` as Chat models, Models endpoint only, 1 token per minute. That autofilters image/video out of the list and the key cannot run inference.

**Rejected.** Vault-credential probes (they send decrypted secrets to the Worker for every picker open, and ChatGPT/Claude login tokens need unofficial list URLs). Operator-curated D1. Cache API: eviction would drop the stale copy the 24-hour rule needs. Cron-only refresh: a quiet Deployment would serve nothing until someone waited on a cold fetch.
