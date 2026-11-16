---
name: test-shard-balancing
description: >-
  Report test timing spreads and balance shards. Use when running tests, reporting test results,
  investigating uneven test durations, or changing shard counts or allocation.
---

# Test shard balancing

- Every test-results report includes each group's worker times and spread in seconds and percent of mean. Say unavailable when evidence is incomplete.
- Compare TypeScript shards with TypeScript and Tao workers with Tao. The spread limit is `max(5 seconds, 10% of group mean)`.
- Base changes on repeated comparable, uncontended full runs. Ignore contention-affected timings; slowness alone does not prove contention.
- Use per-file JUnit wall times. Keep resource groups together and pack by time, allowing a few slow files to fill a shard.
- Try several worker counts within budget. Give consistently faster groups fewer shards. Confirm the fastest acceptable layout on repeated full runs, refine with timings from that worker count, and verify exact-once coverage.
- After two rebalancing attempts, stop if the limit is still exceeded. Notify the Developer with the timings and attempted changes; do not relax the limit.
