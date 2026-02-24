# AgentKarma

**Credit bureau for AI agent wallets.**

AI agents are transacting autonomously — paying each other, buying services, settling invoices — all through crypto wallets. But there's no way to know if the wallet on the other side is trustworthy.

AgentKarma fixes that. It indexes public blockchain data from agent-specific protocols, computes trust scores, and exposes everything through a simple API. One call to check if an agent wallet is safe to transact with.

```typescript
import { AgentKarma } from 'agentkarma'

const karma = new AgentKarma()

// Should my agent pay this wallet?
if (await karma.isHighTrust('0xABC...DEF')) {
  await agent.pay(seller, amount)
}
```

---

## The Problem

Autonomous agents don't have credit scores. When your buyer agent encounters an unknown seller agent, it has no signal to distinguish a legitimate service from a scam wallet. Every transaction is a trust decision made in the dark.

Traditional reputation systems don't work here — agents don't have usernames, profiles, or social graphs. They have wallet addresses and on-chain history. That's the data we use.

## How It Works

AgentKarma watches two on-chain protocols that are purpose-built for AI agent activity:

- **ERC-8004** (Ethereum) — The agent identity standard. NFT-based identity registration + on-chain reputation feedback.
- **x402** (Base L2) — Coinbase's HTTP payment protocol for AI agents. USDC micropayments between autonomous services.

Every agent wallet, transaction, and feedback event is indexed into a Postgres database. A 6-signal scoring algorithm processes this data into a trust score (0–100) for each wallet.

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
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │   Postgres (Neon)     │
         │   wallets · txns ·    │
         │   feedback · scores   │
         └───────────┬───────────┘
                     ▼
         ┌───────────────────────┐
         │   REST API · SDK ·    │
         │   MCP Server          │
         └───────────────────────┘
```

## Trust Score Algorithm

Six weighted signals, computed per wallet:

| Signal | Weight | What It Measures |
|--------|--------|------------------|
| **Loyalty** | 32% | Repeat business with counterparties. Sybil-resistant — caps wallets with suspicious concentration (>20 txns to <3 counterparties). |
| **Activity** | 20% | Transaction volume on log₁₀ scale. 10 txns = 50, 100 txns = 100. |
| **Diversity** | 18% | Unique counterparties on log₁₀ scale. Rewards broad interaction. |
| **Feedback** | 15% | On-chain reputation from ERC-8004. Confidence-weighted with neutral baseline when no feedback exists. |
| **Age** | 9% | Days since first on-chain activity. Full score at 180+ days. |
| **Recency** | 6% | Days since last activity. 100 within 7 days, linear decay to 0 at 90 days. |

+5 bonus for ERC-8004 registered agents. Final score clamped to 0–100.

**Tiers:** HIGH (80+) · MEDIUM (50–79) · LOW (20–49) · MINIMAL (0–19)

Influenced by: EigenTrust (Stanford 2003), zScore DeFi reputation, Gitcoin Passport sybil detection, Arbitrum airdrop analysis.

---

## Quick Start

### Install the SDK

```bash
npm install agentkarma
```

```typescript
import { AgentKarma } from 'agentkarma'

const karma = new AgentKarma()

// Quick boolean gate
const safe = await karma.isHighTrust('0x...')

// Full score with breakdown
const { trust_score, tier, role, breakdown } = await karma.getScore('0x...')

// Custom threshold
const meets = await karma.meetsThreshold('0x...', 60)

// Wallet details + stats
const { wallet, stats } = await karma.lookupWallet('0x...')

// Leaderboard
const leaders = await karma.getLeaderboard({ limit: 20, source: 'x402' })

// Transaction history
const { transactions } = await karma.getTransactions('0x...', { limit: 50 })

// Platform stats
const stats = await karma.getStats()
```

Zero dependencies. Works in Node.js, Deno, Bun, and browsers. Full TypeScript types.

### Use the REST API

```bash
# Trust score
curl https://agent-karma.rushikeshmore271.workers.dev/score/0x...

# Wallet details
curl https://agent-karma.rushikeshmore271.workers.dev/wallet/0x...

# Leaderboard
curl https://agent-karma.rushikeshmore271.workers.dev/leaderboard?limit=10

# Platform stats
curl https://agent-karma.rushikeshmore271.workers.dev/stats
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/score/:address` | Trust score (0–100) with tier, breakdown, and role |
| `GET` | `/wallet/:address` | Full wallet details + transaction/feedback stats |
| `GET` | `/wallets` | List wallets (paginated, filterable by source, sortable) |
| `GET` | `/leaderboard` | Top wallets ranked by trust score |
| `GET` | `/wallet/:address/transactions` | Transaction history |
| `GET` | `/wallet/:address/feedback` | Feedback history |
| `GET` | `/stats` | Database stats, score distribution, indexer state |

### MCP Server

For AI agents that need to query trust data directly:

```bash
npm run mcp
```

| Tool | Description |
|------|-------------|
| `get_trust_score` | Quick score check — trust_score, tier, breakdown |
| `lookup_wallet` | Full wallet info — source, agent ID, scores, stats |
| `get_wallet_trust_signals` | Deep signals — counterparties, volume, feedback, recent txns |
| `list_wallets` | Browse indexed wallets by source |
| `agentkarma_stats` | Database statistics |

Add to Claude Desktop (`claude_desktop_config.json`):

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

---

## Self-Hosting

### Prerequisites

- Node.js 20+
- [Alchemy](https://www.alchemy.com/) account (free tier — 30M CUs/month)
- [Neon](https://neon.tech/) Postgres database (free tier — 500 MB)

### Setup

```bash
git clone https://github.com/rushikeshmore/agent-karma.git
cd agent-karma
npm install
cp .env.example .env  # Add your Alchemy key + Neon connection string
```

### Run

```bash
npm run db:migrate              # Create tables
npm run test:rpc                # Validate RPC connections
npm run indexer:erc8004         # Index agent registrations (Ethereum)
npm run indexer:x402 -- --days 7  # Index payments (Base)
npm run score                   # Compute trust scores
npm run dev                     # Start API server
```

### Deploy to Cloudflare Workers

```bash
npx wrangler secret put DATABASE_URL  # Set your Neon connection string
npx wrangler deploy
```

### Indexer Flags

```bash
npm run indexer:erc8004 -- --limit 5000       # Limit blocks scanned
npm run indexer:x402 -- --days 14             # Backfill N days
npm run indexer:x402 -- --days 3 --limit 1000 # Combine flags
```

---

## Project Structure

```
agent-karma/
├── src/
│   ├── config/        # Environment, constants, blockchain clients
│   ├── db/            # Postgres client + migration
│   ├── indexer/       # ERC-8004 + x402 indexers, CU budget tracker
│   ├── scoring/       # 6-signal trust score engine
│   ├── api/           # Hono REST API (8 endpoints)
│   ├── mcp/           # MCP server (5 tools)
│   └── worker.ts      # Cloudflare Workers entry point
├── sdk/               # npm package: agentkarma
└── .env.example       # Environment template
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ESM) |
| Blockchain | [viem](https://viem.sh/) — Ethereum + Base L2 reads |
| Database | [postgres.js](https://github.com/porsager/postgres) + [Neon](https://neon.tech/) |
| API | [Hono](https://hono.dev/) — portable to Cloudflare Workers |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| RPC | [Alchemy](https://www.alchemy.com/) — Ethereum + Base |
| Deployment | Cloudflare Workers |

Designed to run entirely on free tiers. $0/month infrastructure cost.

## License

MIT
