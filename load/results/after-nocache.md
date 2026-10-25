after-nocache: run 2026-10-25T11:04:56.950Z against http://localhost:3100, 10 s per scenario, Node v22.22.0.

| Scenario | Conns | Requests | Req/s | p50 | p90 | p99 | Max | Errors / non-2xx |
|---|---|---|---|---|---|---|---|---|
| Health check (baseline) | 25 | 20695 | 2070 | 11 ms | 16 ms | 26 ms | 247 ms | 0 / 0 |
| Nearby reports, random spots | 25 | 468 | 47 | 526 ms | 653 ms | 774 ms | 883 ms | 0 / 0 |
| Nearby reports, neighborhood centers | 25 | 501 | 50 | 487 ms | 623 ms | 831 ms | 907 ms | 0 / 0 |
| Analytics, random spots | 25 | 258 | 23 | 1039 ms | 1249 ms | 1357 ms | 1364 ms | 0 / 0 |
| Analytics, neighborhood centers | 25 | 220 | 22 | 1069 ms | 1363 ms | 1666 ms | 1758 ms | 0 / 0 |
| Duplicate check while typing | 25 | 2501 | 250 | 93 ms | 127 ms | 216 ms | 492 ms | 0 / 0 |
| Mission planning (cluster + route) | 25 | 537 | 54 | 473 ms | 568 ms | 648 ms | 683 ms | 0 / 0 |
| Post a report (write + duplicate check + queued triage) | 10 | 866 | 87 | 109 ms | 150 ms | 226 ms | 281 ms | 0 / 0 |
