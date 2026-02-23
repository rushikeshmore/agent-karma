# AgentKarma

Credit bureau for AI agent wallets. Indexes public blockchain data to build trust profiles for autonomous AI agents.

AgentKarma watches two on-chain data sources to identify and track AI agent wallets:

- **ERC-8004 Registry** (Ethereum) — Agent identity NFTs + on-chain reputation feedback
- **x402 Payments** (Base L2) — USDC micropayments between AI agents via Coinbase's payment protocol

## Why This Exists

AI agents are starting to transact autonomously using crypto wallets. Before your agent pays another agent, you want to know: *Is this wallet trustworthy? Has it transacted before? Does it have a history of good behavior?*

AgentKarma answers that by indexing every known agent wallet from public blockchain events and making the data queryable via API and MCP.

## What It Does

```
Ethereum mainnet                    Base L2
┌─────────────────────┐   ┌──────────────────────┐
│ ERC-8004 Registry   │   │ USDC Contract         │
│ - Agent mints (NFT) │   │ - AuthorizationUsed   │
│ - Feedback events   │   │ - Transfer events     │
└────────┬────────────┘   └────────┬─────────────┘
         │                         │
         └───────────┬─────────────┘
                     ▼
         ┌───────────────────────┐
         │   AgentKarma Indexer  │
         │   (CLI scripts)       │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │   Postgres (Neon)     │
         │   wallets             │
         │   transactions        │
         │   feedback            │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │   REST API + MCP      │
         │   Query trust data    │
         └───────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- An [Alchemy](https://www.alchemy.com/) account (free tier)
- A [Neon](https://neon.tech/) Postgres database (free tier)

### Setup

```bash
git clone https://github.com/rushikeshmore/agent-karma.git
cd agent-karma
npm install

# Copy env template and fill in your keys
cp .env.example .env
```

### Run

```bash
# 1. Create database tables
npm run db:migrate

# 2. Validate RPC connections
npm run test:rpc

# 3. Index ERC-8004 agent registrations (Ethereum)
npm run indexer:erc8004

# 4. Index x402 payments (Base)
npm run indexer:x402 -- --days 7

# 5. Start API server
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/wallets` | List wallets (paginated, filterable by `source`) |
| `GET` | `/wallet/:address` | Wallet detail + transaction/feedback stats |
| `GET` | `/wallet/:address/transactions` | Transaction history for a wallet |
| `GET` | `/wallet/:address/feedback` | Feedback history for a wallet |
| `GET` | `/stats` | Database size, wallet count, indexer state |

### Example

```bash
# Get wallet info
curl http://localhost:3000/wallet/0x691ddc82fcbb965b9c03b035389c8a68c1014faf

# List x402-active wallets
curl http://localhost:3000/wallets?source=x402&limit=10

# Check database stats
curl http://localhost:3000/stats
```

## MCP Server

AgentKarma includes an MCP (Model Context Protocol) server so AI agents can query trust data directly.

```bash
npm run mcp
```

### Tools

| Tool | Description |
|------|-------------|
| `lookup_wallet` | Look up a wallet — source, agent ID, transaction count, first/last seen |
| `get_wallet_trust_signals` | Trust indicators — counterparty diversity, volume, feedback scores |
| `list_wallets` | Browse indexed wallets by source |
| `agentkarma_stats` | Database statistics |

### Claude Desktop Config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-karma": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "/path/to/agent-karma",
      "env": {
        "alchemy_key": "YOUR_KEY",
        "neon_db_key": "YOUR_CONNECTION_STRING"
      }
    }
  }
}
```

## Data Sources

### ERC-8004 (Ethereum Mainnet)

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) is an Ethereum standard for AI agent identity and reputation.

- **IdentityRegistry** — ERC-721 NFTs representing agent identities. We index `Transfer` events where `from = 0x0` (mints).
- **ReputationRegistry** — On-chain feedback. We index `NewFeedback` events with value, tags, and metadata.

### x402 (Base L2)

[x402](https://www.x402.org/) is Coinbase's HTTP payment protocol for AI agents. Payments settle via `transferWithAuthorization()` (EIP-3009) on the Base USDC contract.

We detect x402 payments by finding `AuthorizationUsed` events on Base USDC and matching them with `Transfer` events in the same transaction receipt.

## Project Structure

```
agent-karma/
├── src/
│   ├── config/        # Environment, constants, blockchain clients
│   ├── db/            # Postgres client + migration
│   ├── indexer/       # ERC-8004 + x402 indexers, CU tracker
│   ├── api/           # Hono REST API
│   ├── mcp/           # MCP server
│   └── index.ts       # API entry point
├── scripts/           # Test + debug utilities
├── .env.example       # Environment template
└── DEVLOG.md          # Development log
```

## Free Tier Budget

AgentKarma is designed to run entirely on free tiers:

| Service | Free Tier | Usage |
|---------|-----------|-------|
| Alchemy | 30M CUs/month | ~3M CUs for full backfill (~10%) |
| Neon Postgres | 500 MB storage | ~10-50 MB indexed data |
| Neon Compute | 100 CU-hours/month | Minimal (CLI scripts, auto-suspend) |

The CU tracker (`src/indexer/cu-tracker.ts`) monitors Alchemy usage in real-time and auto-stops indexers at 90% of the monthly budget.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run test:rpc` | Validate RPC connections to Ethereum + Base |
| `npm run db:migrate` | Create/update database tables (idempotent) |
| `npm run indexer:erc8004` | Index ERC-8004 mints + feedback (resumable) |
| `npm run indexer:x402` | Index x402 payments on Base (resumable) |
| `npm run dev` | Start API server with hot reload |
| `npm run start` | Start API server |
| `npm run mcp` | Start MCP server (stdio) |

### Indexer Flags

```bash
# Limit blocks scanned
npm run indexer:erc8004 -- --limit 5000

# x402: specify days to backfill
npm run indexer:x402 -- --days 14

# Combine flags
npm run indexer:x402 -- --days 3 --limit 1000
```

## Tech Stack

- **TypeScript** — ESM modules, ES2022 target
- **[viem](https://viem.sh/)** — Ethereum/Base blockchain reads
- **[postgres.js](https://github.com/porsager/postgres)** — Lightweight Postgres driver
- **[Hono](https://hono.dev/)** — Minimal web framework (portable to Cloudflare Workers)
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — MCP server
- **[Neon](https://neon.tech/)** — Serverless Postgres
- **[Alchemy](https://www.alchemy.com/)** — Blockchain RPC provider

## Roadmap

- [x] Phase 0.5: Validate RPC data access
- [x] Phase 1a: ERC-8004 indexer (mints + feedback)
- [x] Phase 1b: x402 indexer (Base USDC payments)
- [x] Phase 1c: Database schema + migration
- [x] Phase 1d: REST API
- [x] Phase 1f: MCP server
- [ ] Phase 1e: Public dashboard
- [ ] Phase 2: Scoring engine
- [ ] Phase 2: npm package (`agent-karma`)
- [ ] Phase 2: Paid API tiers

## License

MIT
