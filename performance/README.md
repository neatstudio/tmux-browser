# Structured Activity Benchmark Evidence

`structured-activity-baseline.json` is a provisional local reference captured
from the exact Phase 1 commit. It is not authoritative CI evidence and must not
be used by CI comparison mode.

Both baseline and candidate artifacts identify the immutable benchmark input as
`structured-activity/v1` with SHA-256
`856e507a53e296d2971b246388ef0702ad013ecd6cf13b7a9d988c418eaf5335`.
Validation fails unless the exact fixture bytes and metadata match: 1,000
records, 100 tool children, 20 Attention records, 160-character summaries, and
8 KiB details on every tenth record.

The `structured-activity-benchmark` workflow creates the authoritative baseline
and candidate sequentially on one pinned Node 22 and Playwright Chromium runner.
It uploads both measurements and the comparison report. A candidate passes only
when its median is at most `1.25x` the freshly measured baseline and at most
`300 ms` absolutely.

Before enabling the authoritative workflow, configure the trusted repository
variable `STRUCTURED_ACTIVITY_BASELINE_SHA` to the completed Phase 1 commit
`519ceee4e1e84480926f3b5b5de992ac88e51b9c`. The workflow fails closed when the
variable is absent, malformed, unavailable in git history, or different from
the generated baseline artifact. Neither the candidate checkout nor the
checked-in provisional artifact selects the authoritative baseline.

The Activity comparator starts immediately before opening the unified Activity
panel, waits for its bounded event window to render, clicks the deterministic
close control, and ends only after observable dialog removal. The interval
covers open, bounded render, and a responsive control click.

Historical commits do not supply benchmark code. The current trusted runner
injects an untracked, version-neutral HTML/JavaScript harness into each temporary
target worktree and imports that checkout's own
`/src/client/render/actionCenter.ts`. It passes both 1,000 legacy action items
and 1,000 preconstructed structured items. A legacy renderer must produce
exactly 1,000 legacy rows; a structured renderer must produce exactly 200
bounded structured rows and no legacy rows. This keeps baseline and candidate
on one fixture without importing candidate renderer or adapter code into the
historical checkout.
