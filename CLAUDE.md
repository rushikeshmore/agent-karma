# AgentKarma

Credit bureau for AI agent wallets. Scores wallet addresses for trustworthiness using public blockchain data.

## Stack
- TypeScript, ESM (`"type": "module"`)
- viem — blockchain reads (Ethereum mainnet + Base L2)
- postgres (postgres.js) — Neon Postgres
- Hono + @hono/node-server — REST API
- tsx — TypeScript runner

## Free Tier Constraints
- **Alchemy Free**: 30M CUs/month, eth_getLogs limited to **10 blocks per query**
- **Neon Free**: 500 MB storage, 100 CU-hours/month, auto-suspends after 5 min idle
- Track CU usage via `src/indexer/cu-tracker.ts`

## Scripts
- `npm run test:rpc` — Phase 0.5 validation
- `npm run db:migrate` — idempotent schema migration
- `npm run indexer:erc8004` — index ERC-8004 mints + feedback
- `npm run indexer:x402` — index x402 payments on Base
- `npm run dev` — local API server with watch mode

## Key Contracts
- IdentityRegistry: `0x8004A169...` (Ethereum, block 21339871)
- ReputationRegistry: `0x8004BAa1...` (Ethereum, block 21339873)
- USDC on Base: `0x833589fC...`
