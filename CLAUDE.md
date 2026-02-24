# AgentKarma

Credit bureau for AI agent wallets. Scores wallet addresses for trustworthiness using public blockchain data.

## Stack
- TypeScript, ESM (`"type": "module"`)
- viem — blockchain reads (Ethereum mainnet + Base L2)
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
- `npm run indexer:erc8004` — index ERC-8004 mints + feedback
- `npm run indexer:x402` — index x402 payments on Base
- `npm run dev` — local API server with watch mode
- `npm run mcp` — MCP server (stdio transport)

## Key Contracts
- IdentityRegistry: `0x8004A169...` (Ethereum, block 24339925)
- ReputationRegistry: `0x8004BAa1...` (Ethereum, block 24339925)
- USDC on Base: `0x833589fC...`

## MCP Tools (5)
- `lookup_wallet` — wallet info + trust score + stats
- `get_wallet_trust_signals` — trust indicators (tx history, counterparties, feedback)
- `get_trust_score` — quick 0-100 score check with tier + breakdown
- `list_wallets` — browse indexed wallets by source
- `agentkarma_stats` — database statistics

## Scoring Algorithm
6 weighted signals: loyalty (32%), activity (20%), diversity (18%), feedback (15%), age (9%), recency (6%)
+5 bonus for ERC-8004 registered agents. Sybil resistance on loyalty signal.
Bulk UPDATE via CTE+VALUES (500 wallets/batch, 6200 in 7.4s).

## Packages
- `packages/sdk/` — npm package `agentkarma` (zero deps, TypeScript)
- `packages/dashboard/` — Next.js 16 + Tailwind (dark theme, Vercel-ready)

## DB State
- 6,200 wallets (100% scored), 1,992 transactions, 676 feedback, 13 MB / 500 MB
