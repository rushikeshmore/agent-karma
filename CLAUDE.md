# AgentKarma

Credit bureau for AI agent wallets. Scores wallet addresses for trustworthiness using public blockchain data.

## Stack
- TypeScript, ESM (`"type": "module"`)
- viem — blockchain reads (Ethereum mainnet + Base L2 + Arbitrum)
- postgres (postgres.js) — Neon Postgres
- Hono + @hono/node-server — REST API
- @modelcontextprotocol/sdk — MCP server for AI agent access
- tsx — TypeScript runner

## Free Tier Constraints
- **Alchemy Free**: 30M CUs/month, eth_getLogs limited to **10 blocks per query**
- **Neon Free**: 500 MB storage, 100 CU-hours/month, auto-suspends after 5 min idle
- CU tracker auto-stops indexers at 90% of monthly budget (`src/indexer/cu-tracker.ts`)
- All deps are open source — $0/month total

## Scripts
- `npm run test:rpc` — Phase 0.5 validation
- `npm run db:migrate` — idempotent schema migration
- `npm run indexer:erc8004` — index ERC-8004 mints + feedback (Ethereum + Base + Arbitrum)
- `npm run indexer:x402` — index x402 payments (Base default, `--chain arbitrum` or `--chain all`)
- `npm run dev` — local API server with watch mode
- `npm run mcp` — MCP server (stdio transport)
- `npm run score` — compute trust scores (use `--full` for full rescore)

## Key Contracts
- IdentityRegistry: `0x8004A169...` (Ethereum block 24339925, Base block ~26000000)
- ReputationRegistry: `0x8004BAa1...` (Ethereum block 24339925, Base block ~26000000)
- USDC on Base: `0x833589fC...`

## API Endpoints (v0.6.0)
- `GET /` — health check
- `GET /score/:address` — trust score with tier + breakdown
- `GET /wallet/:address` — full wallet detail + stats
- `GET /wallet/:address/transactions` — transaction history
- `GET /wallet/:address/feedback` — feedback history
- `GET /wallet/:address/score-history` — score trend over time
- `GET /wallets` — browse wallets (filterable by source, score_min, score_max)
- `GET /leaderboard` — top wallets by score
- `GET /stats` — database statistics
- `POST /wallets/batch-scores` — batch lookup (max 100)
- `POST /feedback` — submit feedback for a transaction
- `POST /api-keys` — generate a free API key (1000 req/day)
- `GET /openapi.json` — OpenAPI 3.0 spec (redirects to GitHub)
- `GET /openai-functions.json` — OpenAI function-calling schema (redirects to GitHub)

## MCP Tools (6)
- `lookup_wallet` — wallet info + trust score + stats
- `get_wallet_trust_signals` — trust indicators (tx history, counterparties, feedback)
- `get_trust_score` — quick 0-100 score check with tier + breakdown
- `batch_trust_scores` — batch lookup for multiple wallets
- `list_wallets` — browse indexed wallets by source
- `agentkarma_stats` — database statistics

## Scoring Algorithm (v3)
7 weighted signals: loyalty (30%), activity (18%), diversity (16%), feedback (15%), volume (10%), recency (6%), age (5%)
+5 bonus for ERC-8004 registered agents. Sybil resistance on loyalty signal (cap at 40 when avgTxPerPartner >= 20 with < 3 counterparties).
Age uses log-scale (early days matter more). Volume defaults to neutral when no data.
Incremental scoring via `needs_rescore` flag. Score history tracked per run.
Bulk UPDATE via unnest arrays (1 SQL per batch of 500, not per row).

## Dual Entry Points
Every API route exists in BOTH:
- `src/api/routes.ts` — Node.js/postgres.js (tagged templates with identifier helpers)
- `src/worker.ts` — CF Workers/neon serverless (no identifier helpers, conditional SQL)

## Error Resilience
- Indexers retry RPC calls (429/502/timeout) with exponential backoff (3 attempts)
- Individual insert failures logged and skipped (don't crash the full run)
- JSON parse errors on POST routes return 400, not 500
- CU tracker auto-stops indexers at 80% of monthly budget

## Testing
- `npm test` runs both scoring + SDK tests (75 total)
- Scoring: 49 tests (all 7 signals, edge cases, NaN guards, Sybil cap)
- SDK: 26 tests (all methods, error handling, param mapping)

## SDK Public Methods (11)
- `getScore`, `isHighTrust`, `meetsThreshold`, `batchScores`, `lookupWallet`
- `getTransactions`, `getScoreHistory`, `getLeaderboard`, `listWallets`, `getStats`, `submitFeedback`

## Packages
- `sdk/` — npm package `agentkarma` (zero deps, TypeScript)
