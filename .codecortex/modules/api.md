# Module: api

## Purpose
1 files, 480 lines (typescript). Auto-generated from code structure. Updated on each commit via git hooks.

## Data Flow
implementation: 1 files (routes.ts)

## Public API

## Dependencies
- Imports from: db

## Temporal Signals
- **Churn:** 16 changes (stabilizing)
- **Coupled with:** src/worker.ts (15 co-changes, 83%), src/mcp/server.ts (8 co-changes, 50%), src/scoring/compute.ts (8 co-changes, 50%), src/db/migrate.ts (8 co-changes, 50%), sdk/src/client.ts (7 co-changes, 44%), sdk/src/types.ts (7 co-changes, 44%), src/indexer/erc8004.ts (6 co-changes, 38%), src/indexer/x402.ts (6 co-changes, 38%), src/scoring/__tests__/compute.test.ts (4 co-changes, 25%), sdk/src/index.ts (3 co-changes, 19%), src/config/constants.ts (3 co-changes, 19%)
- **Stability:** stabilizing
- **Bug history:** parse score_breakdown in score-history endpoint; comprehensive DX overhaul — all 16 remaining issues; DX round 2 — type accuracy, clean responses, validation errors; DX critical — parse score_breakdown, add tier, strip internal fields; production audit — smithery env vars, dead code, docs alignment; v0.5.1 hardening — rate limiting, CORS, webhooks, validation; 14 bugs and robustness improvements from codebase audit
- **Last changed:** 2026-03-15T01:56:58+05:30
