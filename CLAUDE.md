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

## MCP Tools
- `lookup_wallet` — wallet info + stats
- `get_wallet_trust_signals` — trust indicators (tx history, counterparties, feedback)
- `list_wallets` — browse indexed wallets by source
- `agentkarma_stats` — database statistics
