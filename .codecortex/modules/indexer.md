# Module: indexer

## Purpose
3 files, 825 lines (typescript). Auto-generated from code structure. Updated on each commit via git hooks.

## Data Flow
implementation: 3 files (cu-tracker.ts, erc8004.ts, x402.ts)

## Public API
- `trackCU (function, src/indexer/cu-tracker.ts:11-30)`
- `shouldStop (function, src/indexer/cu-tracker.ts:36-38)`
- `getCUUsage (function, src/indexer/cu-tracker.ts:40-47)`
- `resetCUUsage (function, src/indexer/cu-tracker.ts:49-53)`

## Dependencies
- Imports from: config, db

## Temporal Signals
- **Churn:** 6 changes (stabilizing)
- **Coupled with:** src/api/routes.ts (6 co-changes, 38%), src/api/routes.ts (6 co-changes, 38%), src/indexer/x402.ts (6 co-changes, 100%), src/worker.ts (5 co-changes, 28%), src/worker.ts (5 co-changes, 28%), src/db/migrate.ts (4 co-changes, 50%), src/db/migrate.ts (4 co-changes, 50%), src/mcp/server.ts (4 co-changes, 44%), src/mcp/server.ts (4 co-changes, 44%), sdk/src/types.ts (3 co-changes, 43%), sdk/src/types.ts (3 co-changes, 43%), src/config/constants.ts (3 co-changes, 50%), src/config/constants.ts (3 co-changes, 50%)
- **Stability:** stabilizing
- **Bug history:** 14 bugs and robustness improvements from codebase audit; 14 bugs and robustness improvements from codebase audit
- **Last changed:** 2026-03-15T00:33:56+05:30
