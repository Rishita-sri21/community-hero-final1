after: run 2026-10-25T11:06:57.885Z against http://localhost:3100, 10 s per scenario, Node v22.22.0.

| Scenario | Conns | Requests | Req/s | p50 | p90 | p99 | Max | Errors / non-2xx |
|---|---|---|---|---|---|---|---|---|
| Health check (baseline) | 25 | 28694 | 2609 | 8 ms | 13 ms | 22 ms | 193 ms | 0 / 0 |
| Nearby reports, random spots | 25 | 490 | 49 | 499 ms | 632 ms | 751 ms | 819 ms | 0 / 0 |
| Nearby reports, neighborhood centers | 25 | 3694 | 369 | 63 ms | 84 ms | 143 ms | 1347 ms | 0 / 0 |
| Analytics, random spots | 25 | 188 | 19 | 1279 ms | 1451 ms | 1643 ms | 1653 ms | 0 / 0 |
| Analytics, neighborhood centers | 25 | 22227 | 2021 | 11 ms | 15 ms | 24 ms | 793 ms | 0 / 0 |
| Duplicate check while typing | 25 | 2463 | 246 | 95 ms | 134 ms | 170 ms | 216 ms | 0 / 0 |
| Mission planning (cluster + route) | 25 | 516 | 52 | 479 ms | 579 ms | 716 ms | 756 ms | 0 / 0 |
| Post a report (write + duplicate check + queued triage) | 10 | 940 | 94 | 101 ms | 135 ms | 189 ms | 262 ms | 0 / 0 |
