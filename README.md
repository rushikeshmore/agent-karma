# AgentKarma

**Credit bureau for AI agent wallets.**

AI agents are transacting on their own now. They pay each other, buy services, settle invoices, all through crypto wallets. But there's no way to tell if the wallet on the other side is legit.

AgentKarma solves this. It indexes public blockchain data from agent-specific protocols, scores every wallet for trustworthiness, and gives you a simple API to check before you transact.

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

Autonomous agents don't have credit scores. When your buyer agent runs into an unknown seller, it has no signal to tell a real service from a scam wallet. Every transaction is a trust decision made blind.

Traditional reputation systems won't help here. Agents don't have usernames, profiles, or social graphs. They have wallet addresses and on-chain history. That's the data we score.

## How It Works

AgentKarma watches two on-chain protocols built specifically for AI agent activity:

- **ERC-8004** (Ethereum, Base, Arbitrum) - The agent identity standard. NFT-based registration with on-chain reputation feedback.
- **x402** (Base, Arbitrum) - Coinbase's HTTP payment protocol for AI agents. USDC micropayments between autonomous services.

Every wallet, transaction, and feedback event gets indexed into Postgres. A 7-signal scoring algorithm turns this into a trust score (0-100) for each wallet.

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

Seven weighted signals, computed per wallet:

| Signal | Weight | What it measures |
| --- | --- | --- |
| **Loyalty** | 30% | Repeat business with counterparties. Sybil-resistant: caps wallets with suspicious concentration (20+ txns to fewer than 3 partners). |
| **Activity** | 18% | Transaction count on a log scale. 10 txns = 50, 100 txns = 100. |
| **Diversity** | 16% | Number of unique counterparties, log scaled. Rewards broad interaction. |
| **Feedback** | 15% | On-chain reputation from ERC-8004. Confidence-weighted, defaults to neutral when there's no feedback. |
| **Volume** | 10% | Average USDC deal size, log scaled. Larger deals signal higher commitment. |
| **Recency** | 6% | How recently active. Full score within 7 days, decays to 0 at 90 days. |
| **Age** | 5% | Days since first on-chain appearance. Full score at 180+ days. |

ERC-8004 registered agents get a +5 bonus. Final score is clamped to 0-100.

**Tiers:** HIGH (80+), MEDIUM (50-79), LOW (20-49), MINIMAL (0-19)

Built on ideas from EigenTrust (Stanford 2003), zScore DeFi reputation, Gitcoin Passport sybil detection, and Arbitrum airdrop analysis.

---

## Quick Start

### Install the SDK

```bash
npm install agentkarma
```

```typescript
import { AgentKarma } from 'agentkarma'

const karma = new AgentKarma()
// Or with an API key for higher limits and webhooks:
// const karma = new AgentKarma({ apiKey: 'ak_...' })

// Quick boolean gate
const safe = await karma.isHighTrust('0x...')

// Full score with breakdown
const { trust_score, tier, role, breakdown } = await karma.getScore('0x...')

// Custom threshold
const meets = await karma.meetsThreshold('0x...', 60)

// Wallet details and stats
const { wallet, stats } = await karma.lookupWallet('0x...')

// Leaderboard
const leaders = await karma.getLeaderboard({ limit: 20, source: 'x402' })

// Transaction history
const { transactions } = await karma.getTransactions('0x...', { limit: 50 })

// Platform stats
const platformStats = await karma.getStats()
```

Zero dependencies. Works in Node.js, Deno, Bun, and browsers. Full TypeScript types included.

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
| --- | --- | --- |
| `GET` | `/score/:address` | Trust score (0-100) with tier, breakdown, and role |
| `GET` | `/wallet/:address` | Full wallet details with transaction and feedback stats |
| `GET` | `/wallets` | Browse wallets (paginated, filterable, sortable) |
| `GET` | `/leaderboard` | Top wallets ranked by trust score |
| `GET` | `/wallet/:address/transactions` | Transaction history |
| `GET` | `/wallet/:address/feedback` | Feedback history |
| `GET` | `/wallet/:address/score-history` | Score trend over time |
| `GET` | `/stats` | Database stats, score distribution, indexer state |
| `POST` | `/wallets/batch-scores` | Batch lookup trust scores (max 100 addresses) |
| `POST` | `/feedback` | Submit feedback for a transaction |
| `POST` | `/api-keys` | Generate a free API key (1,000 req/day) |
| `POST` | `/webhooks` | Register a webhook for score change notifications |
| `GET` | `/webhooks` | List your registered webhooks |
| `DELETE` | `/webhooks/:id` | Delete a webhook |
| `GET` | `/openapi.json` | OpenAPI 3.0 spec |

### Authentication

No key needed to get started. Anonymous requests get 100/day. Create a free API key for 1,000/day:

```bash
curl -X POST https://agent-karma.rushikeshmore271.workers.dev/api-keys \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'
```

Then pass it in the `x-api-key` header on subsequent requests.

### MCP Server

For AI agents that want to query trust data directly:

```bash
npm run mcp
```

| Tool | Description |
| --- | --- |
| `get_trust_score` | Quick score check with tier and breakdown |
| `lookup_wallet` | Full wallet info, agent ID, scores, stats |
| `get_wallet_trust_signals` | Deep signals: counterparties, volume, feedback, recent txns |
| `batch_trust_scores` | Batch lookup for multiple wallets (max 100) |
| `list_wallets` | Browse indexed wallets by source |
| `agentkarma_stats` | Database statistics |
| `manage_webhooks` | Register, list, and delete score change webhooks |

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

### Webhooks

Get notified when wallet scores change. Requires an API key.

```typescript
const karma = new AgentKarma({ apiKey: 'ak_...' })

// Alert me if any wallet drops below 50
await karma.registerWebhook({
  url: 'https://myapp.com/alerts',
  event_type: 'score_drop',
  threshold: 50,
})

// Or watch a specific wallet for any score change
await karma.registerWebhook({
  url: 'https://myapp.com/alerts',
  wallet_address: '0x...',
})
```

Three event types: `score_change` (any change), `score_drop`, `score_rise`. You can optionally filter to a specific wallet and set a threshold that triggers when the score crosses it.

---

## Self-Hosting

### Prerequisites

- Node.js 20+
- [Alchemy](https://www.alchemy.com/) account (free tier, 30M compute units/month)
- [Neon](https://neon.tech/) Postgres database (free tier, 500 MB)

### Setup

```bash
git clone https://github.com/rushikeshmore/agent-karma.git
cd agent-karma
npm install
cp .env.example .env  # Add your Alchemy key and Neon connection string
```

### Run

```bash
npm run db:migrate              # Create tables
npm run test:rpc                # Validate RPC connections
npm run indexer:erc8004         # Index agent registrations
npm run indexer:x402 -- --days 7  # Index x402 payments
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
npm run score -- --full                       # Rescore all wallets
```

---

## Project Structure

```
agent-karma/
├── src/
│   ├── config/        # Environment, constants, chain clients
│   ├── db/            # Postgres client and migrations
│   ├── indexer/       # ERC-8004 + x402 indexers, CU budget tracker
│   ├── scoring/       # 7-signal trust score engine
│   ├── api/           # Hono REST API (16 endpoints)
│   ├── mcp/           # MCP server (7 tools)
│   └── worker.ts      # Cloudflare Workers entry point
├── sdk/               # npm package: agentkarma
├── openapi.yaml       # OpenAPI 3.0 spec
└── .env.example       # Environment template
```

## Tech Stack

| Component | Technology |
| --- | --- |
| Language | TypeScript (ESM) |
| Blockchain | [viem](https://viem.sh/) for Ethereum, Base, and Arbitrum |
| Database | [postgres.js](https://github.com/porsager/postgres) + [Neon](https://neon.tech/) |
| API | [Hono](https://hono.dev/), runs on Cloudflare Workers |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| RPC | [Alchemy](https://www.alchemy.com/) (Ethereum, Base, Arbitrum) |
| Hosting | Cloudflare Workers |

## License

MIT
