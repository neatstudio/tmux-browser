# Structured Activity Benchmark Evidence

`structured-activity-baseline.json` is a provisional local reference captured
from the exact Phase 1 commit. It is not authoritative CI evidence and must not
be used by CI comparison mode.

The `structured-activity-benchmark` workflow creates the authoritative baseline
and candidate sequentially on one pinned Node 22 and Playwright Chromium runner.
It uploads both measurements and the comparison report. A candidate passes only
when its median is at most `1.25x` the freshly measured baseline and at most
`300 ms` absolutely.

The pre-Activity comparator first renders the existing Action Center, then
measures a deterministic close-button response through observable dialog
removal. When Activity exists, replace the mark names and interaction with the
new panel's comparable interactive response.
