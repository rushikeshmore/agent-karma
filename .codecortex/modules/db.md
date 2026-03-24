# Module: db

## Purpose
2 files, 176 lines (typescript). Auto-generated from code structure. Updated on each commit via git hooks.

## Data Flow
implementation: 2 files (client.ts, migrate.ts)

## Public API

## Dependencies
- Imports from: config
- Imported by: api, indexer, scoring

## Temporal Signals
- **Churn:** 8 changes (stabilizing)
- **Coupled with:** src/api/routes.ts (8 co-changes, 50%), src/worker.ts (7 co-changes, 39%), src/mcp/server.ts (5 co-changes, 56%), src/scoring/compute.ts (5 co-changes, 56%), src/indexer/erc8004.ts (4 co-changes, 50%), src/indexer/x402.ts (4 co-changes, 50%), sdk/src/types.ts (4 co-changes, 50%), sdk/src/client.ts (3 co-changes, 38%), sdk/src/index.ts (3 co-changes, 38%), src/config/constants.ts (3 co-changes, 38%)
- **Stability:** stabilizing
- **Bug history:** v0.5.1 hardening — rate limiting, CORS, webhooks, validation
- **Last changed:** 2026-03-15T00:33:56+05:30
