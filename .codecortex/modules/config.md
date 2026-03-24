# Module: config

## Purpose
3 files, 87 lines (typescript). Auto-generated from code structure. Updated on each commit via git hooks.

## Data Flow
implementation: 3 files (chains.ts, constants.ts, env.ts)

## Public API
- `ethClient (const, src/config/chains.ts:5-8)`
- `baseClient (const, src/config/chains.ts:10-13)`
- `arbClient (const, src/config/chains.ts:15-18)`
- `IDENTITY_REGISTRY (const, src/config/constants.ts:2)`
- `REPUTATION_REGISTRY (const, src/config/constants.ts:3)`
- `IDENTITY_DEPLOY_BLOCK (const, src/config/constants.ts:4)`
- `REPUTATION_DEPLOY_BLOCK (const, src/config/constants.ts:5)`
- `BASE_IDENTITY_DEPLOY_BLOCK (const, src/config/constants.ts:10)`
- `BASE_REPUTATION_DEPLOY_BLOCK (const, src/config/constants.ts:11)`
- `ARB_IDENTITY_DEPLOY_BLOCK (const, src/config/constants.ts:15)`
- `ARB_REPUTATION_DEPLOY_BLOCK (const, src/config/constants.ts:16)`
- `BASE_USDC (const, src/config/constants.ts:19)`
- `ARB_USDC (const, src/config/constants.ts:22)`
- `KNOWN_FACILITATORS (const, src/config/constants.ts:25-27)`
- `TRANSFER_TOPIC (const, src/config/constants.ts:30)`
- `BATCH_SIZE (const, src/config/constants.ts:33)`
- `BATCH_DELAY_MS (const, src/config/constants.ts:34)`
- `BATCH_DELAY_BASE_MS (const, src/config/constants.ts:35)`
- `BATCH_DELAY_ARB_MS (const, src/config/constants.ts:36)`
- `RECEIPT_DELAY_MS (const, src/config/constants.ts:37)`
- `CU_COSTS (const, src/config/constants.ts:40-47)`
- `MONTHLY_CU_BUDGET (const, src/config/constants.ts:50)`
- `CU_WARNING_THRESHOLD (const, src/config/constants.ts:51)`
- `env (const, src/config/env.ts:11-15)`

## Dependencies
- Imported by: db, indexer

## Temporal Signals
- **Churn:** 3 changes (moderate)
- **Coupled with:** src/api/routes.ts (3 co-changes, 19%), src/db/migrate.ts (3 co-changes, 38%), src/indexer/erc8004.ts (3 co-changes, 50%), src/indexer/x402.ts (3 co-changes, 50%)
- **Stability:** moderate
- **Last changed:** 2026-02-25T16:18:01+05:30
