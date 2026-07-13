# Structured Activity Benchmark Evidence

`structured-activity-baseline.json` is a provisional local reference captured
from the exact Phase 1 commit. It is not authoritative CI evidence and must not
be used by CI comparison mode.

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

The pre-Activity comparator starts immediately before opening the existing
Action Center, waits for the dialog to render, clicks its deterministic close
control, and ends only after observable dialog removal. The interval therefore
covers open, render, and a responsive control click. When Activity exists,
replace the mark names and interaction with the new panel's comparable response.
