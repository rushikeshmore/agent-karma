# AgentKarma Dev Log

## Session 2 — 2026-02-23: Phase 1 Build (All Code Complete)

### What Was Built
All Phase 1 code is complete and working:

| Component | File | Status |
|-----------|------|--------|
| Config: env vars | `src/config/env.ts` | Done |
| Config: constants | `src/config/constants.ts` | Done |
| Config: viem clients | `src/config/chains.ts` | Done |
| DB: postgres client | `src/db/client.ts` | Done |
| DB: migration | `src/db/migrate.ts` | Done (7.4 MB / 500 MB) |
| CU budget tracker | `src/indexer/cu-tracker.ts` | Done |
| ERC-8004 indexer | `src/indexer/erc8004.ts` | Done |
| x402 indexer | `src/indexer/x402.ts` | Done |
| Hono API server | `src/api/routes.ts` | Done |
| Entry point | `src/index.ts` | Done |
| Phase 0.5 test | `scripts/test-rpc.ts` | All 4 tests pass |

### Bugs Found & Fixed

1. **Wrong deployment block** — Research said block 21339871, actual first mint was block **24339925** (Jan 29, 2026). Found via `alchemy_getAssetTransfers` API.

2. **Alchemy 10-block limit** — Research said 2000 blocks per getLogs. Alchemy free tier actually limits to **10 blocks**. Changed `BATCH_SIZE` from 2000n to 10n.

3. **Batch insert duplicate addresses** — Same wallet can mint multiple agent NFTs in one batch. Fix: Map-based deduplication before INSERT.

4. **Wrong TRANSFER_TOPIC hash** — Had `0xddf252ad...c550d1`, correct is `0xddf252ad...23b3ef`. This caused x402 indexer to find 133 AuthorizationUsed events but match 0 Transfer events. Fixed — now working (156 txns from 100 blocks test).

### Backfill Status

| Indexer | Progress | Mints/Txns Found | Notes |
|---------|----------|-------------------|-------|
| ERC-8004 (mints) | ~4% (block ~24347255 / 24514986) | 12,276+ mints | Was running, killed by Neon auto-suspend. Resumable. |
| ERC-8004 (feedback) | Not started | — | Runs after mints complete |
| x402 (Base) | Tested 100 blocks | 156 txns, 54 wallets | Working. Full 7-day backfill not started. |

### DB State (at time of pause)
- Wallets: ~4,520 (from partial ERC-8004 backfill + x402 test)
- Transactions: 156 (from x402 100-block test)
- Feedback: 0 (not indexed yet)
- DB size: ~9.4 MB / 500 MB

### CU Budget Usage
- Session total: ~55K CUs (0.18% of 30M monthly budget)
- Backfill estimate remaining: ~2.5M CUs for ERC-8004 + ~500K for x402 7-day = ~3M total (~10%)

### Next Steps (Tomorrow)
1. Run full ERC-8004 backfill: `npm run indexer:erc8004` (resumable from block ~24347255)
2. Run x402 7-day backfill: `npm run indexer:x402 -- --days 7`
3. Verify with `npm run dev` + `curl localhost:3000/stats`
4. Consider: increase batch delay to reduce Neon compute usage
5. Phase 2 planning: scoring engine design

### API Endpoints (all tested and working)
```
GET /              → health check
GET /wallets       → paginated wallet list (?source=erc8004&limit=20&offset=0)
GET /wallet/:addr  → wallet detail + stats
GET /wallet/:addr/transactions → tx history
GET /wallet/:addr/feedback     → feedback history
GET /stats         → DB size, counts, indexer state
```

---

## Session 1 — 2026-02-23: Research + Planning
- Full A2A economic layer exploration in Obsidian vault
- Chose AgentWalletScore as build target
- Created build plan, research spike, infra research
- Set up Alchemy + Neon accounts
- Created GitHub repo + git init
