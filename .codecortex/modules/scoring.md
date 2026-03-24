# Module: scoring

## Purpose
2 files, 817 lines (typescript). Auto-generated from code structure. Updated on each commit via git hooks.

## Data Flow
tests: 1 files (compute.test.ts). implementation: 1 files (compute.ts)

## Public API
- `WEIGHTS (const, src/scoring/compute.ts:28-36)`
- `ageScore (function, src/scoring/compute.ts:45-50)`
- `activityScore (function, src/scoring/compute.ts:57-60)`
- `diversityScore (function, src/scoring/compute.ts:66-69)`
- `loyaltyScore (function, src/scoring/compute.ts:76-88)`
- `recencyScore (function, src/scoring/compute.ts:94-101)`
- `feedbackScore (function, src/scoring/compute.ts:108-113)`
- `volumeScore (function, src/scoring/compute.ts:121-125)`
- `WalletSignals (interface, src/scoring/compute.ts:129-140)`
- `computeScore (function, src/scoring/compute.ts:142-184)`

## Dependencies
- Imports from: db

## Temporal Signals
- **Churn:** 9 changes (stabilizing)
- **Coupled with:** src/api/routes.ts (8 co-changes, 50%), src/worker.ts (8 co-changes, 44%), src/mcp/server.ts (6 co-changes, 67%), sdk/src/client.ts (5 co-changes, 56%), sdk/src/types.ts (5 co-changes, 56%), src/db/migrate.ts (5 co-changes, 56%), src/api/routes.ts (4 co-changes, 25%), src/scoring/compute.ts (4 co-changes, 44%), src/worker.ts (4 co-changes, 22%), sdk/src/client.ts (3 co-changes, 38%), sdk/src/types.ts (3 co-changes, 43%), src/mcp/server.ts (3 co-changes, 33%), sdk/src/index.ts (3 co-changes, 33%)
- **Stability:** stabilizing
- **Bug history:** comprehensive DX overhaul — all 16 remaining issues; v0.5.1 hardening — rate limiting, CORS, webhooks, validation; 14 bugs and robustness improvements from codebase audit; batch score_history inserts (was 1 row/query, now 500/query); comprehensive DX overhaul — all 16 remaining issues; 14 bugs and robustness improvements from codebase audit
- **Last changed:** 2026-03-15T00:55:30+05:30
