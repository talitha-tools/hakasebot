# Similar-model option on each Model slot

Vendors retire model ids. A Model slot stored `claude-opus-4-8` would spawn that string until the CLI died. The live Model catalog already knows the id is gone and that `claude-opus-5` is the same family. We decide the model before spawn, from the catalog, not from CLI stderr.

**Decision.** Each Model slot carries a similar-model option, on by default. The Home job uses the Model catalog snapshot from the Runtime pack (ADR-0032). A missing catalog is treated as a failed list. A pure `judgeModel` call returns a `ModelVerdict`: run the stored id, run a same-family successor, or refuse. Evidence of removal is a successful list, the stored id missing, and a same-family successor present. Probe failure and "missing with no kin" both run the stored id. Option off plus removal evidence returns `{ kind: "failed" }` with a progress-comment reason and does not walk the Model queue. Option on plus a successor runs that id and the posted review body starts with a note. The content hash includes the note so skip-unchanged cannot hide it.

`judgeModel` runs inside the existing queue callback, so `withModelQueueFallback` stays auth-only and a refused similar-model outcome is an ordinary non-auth `failed` `RunResult`.

**Matching.** Family is the non-numeric word set of the id (noise tokens and date stamps dropped). Version is the numeric runs. Same family, highest version, id-string tie-break. `claude-opus-4-8` and `claude-opus-5` share `{claude, opus}`. Opus never becomes sonnet.

**Rejected.** CLI miss, then probe (every Engine's "unknown model" text becomes product policy, and option-off still pays for a doomed spawn). Stored catalog-vs-custom origin (successor presence already classifies removal). A hardcoded successor map (another curated table).
