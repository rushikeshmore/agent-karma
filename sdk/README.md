# agentkarma

Trust scores for AI agent wallets. One-line credit check before transacting.

Zero dependencies. Works in Node.js, Deno, Bun, Cloudflare Workers, and browsers.

## Install

```bash
npm install agentkarma
```

## Quick Start

```typescript
import { AgentKarma } from 'agentkarma'

const karma = new AgentKarma()

// One-line trust check
if (await karma.isHighTrust('0x...')) {
  // safe to transact
}

// Detailed score
const { trust_score, tier, role } = await karma.getScore('0x...')
console.log(`${trust_score}/100 (${tier}) - ${role}`) // "84/100 (HIGH) - seller"
```

## API

### `new AgentKarma(options?)`

Create a client instance.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseUrl` | `string` | Public API | Custom API base URL |
| `timeout` | `number` | `10000` | Request timeout in ms |
| `apiKey` | `string` | - | API key for higher rate limits |

```typescript
const karma = new AgentKarma({
  baseUrl: 'https://agent-karma.rushikeshmore271.workers.dev',
  timeout: 5000,
  apiKey: 'ak_...', // optional, get one via POST /api-keys
})
```

### `getScore(address): Promise<TrustScore>`

Get the trust score for a wallet. Returns a 0-100 score, tier, breakdown, and metadata.

```typescript
const result = await karma.getScore('0x691ddc82fcbb965b9c03b035389c8a68c1014faf')
// {
//   address: '0x691d...',
//   trust_score: 84,
//   tier: 'HIGH',
//   percentile: 92,
//   breakdown: { loyalty: 90, activity: 80, diversity: 70, ... },
//   scored_at: '2026-01-15T...',
//   source: 'erc8004',
//   tx_count: 42,
//   role: 'seller'
// }
```

### `isHighTrust(address): Promise<boolean>`

Returns `true` if the wallet's tier is HIGH (score >= 80).

```typescript
if (await karma.isHighTrust('0x...')) {
  // proceed with transaction
}
```

### `meetsThreshold(address, minScore): Promise<boolean>`

Check if a wallet meets a minimum score. Unscored wallets are treated as 0.

```typescript
if (await karma.meetsThreshold('0x...', 50)) {
  // score is at least 50
}
```

### `batchScores(addresses): Promise<BatchScoresResponse>`

Look up scores for multiple wallets at once (max 100).

```typescript
const { scores, not_found } = await karma.batchScores(['0xABC...', '0xDEF...'])
```

### `lookupWallet(address): Promise<WalletLookupResponse>`

Full wallet details including transaction and feedback counts.

```typescript
const { wallet, stats } = await karma.lookupWallet('0x...')
console.log(wallet.source)          // 'erc8004' | 'x402'
console.log(stats.transactions)     // 42
console.log(stats.feedback)         // 5
```

### `getTransactions(address, options?): Promise<TransactionsResponse>`

Transaction history for a wallet. Supports pagination with `limit` and `offset`.

```typescript
const { transactions } = await karma.getTransactions('0x...', {
  limit: 10,
  offset: 0,
})
```

### `getScoreHistory(address, options?): Promise<ScoreHistoryResponse>`

Score trend over time for a wallet.

```typescript
const { history } = await karma.getScoreHistory('0x...', { limit: 10 })
```

### `getLeaderboard(options?): Promise<LeaderboardEntry[]>`

Top wallets by trust score. Optionally filter by source.

```typescript
const leaders = await karma.getLeaderboard({ limit: 10, source: 'erc8004' })
// [{ rank: 1, address: '0x...', trust_score: 95, ... }, ...]
```

### `listWallets(options?): Promise<ListWalletsResponse>`

Browse indexed wallets with filters.

```typescript
const { wallets, total } = await karma.listWallets({
  limit: 10,
  sort: 'score',
  scoreMin: 50,
})
```

### `getStats(): Promise<Stats>`

Platform statistics: wallet counts, transactions, score distribution, database usage.

```typescript
const stats = await karma.getStats()
console.log(stats.transactions)     // 22000
console.log(stats.db_size_mb)       // '28.5'
```

### `submitFeedback(params): Promise<FeedbackResponse>`

Submit feedback for a wallet's transaction.

```typescript
const { feedback_id } = await karma.submitFeedback({
  address: '0x...',
  tx_hash: '0x...',
  rating: 5,
  comment: 'Fast and reliable',
})
```

## Types

All types are exported from the package:

```typescript
import type {
  TrustScore,
  ScoreTier,           // 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'
  WalletRole,          // 'buyer' | 'seller' | 'both'
  ScoreBreakdown,
  Wallet,
  WalletStats,
  WalletLookupResponse,
  LeaderboardEntry,
  Transaction,
  TransactionsResponse,
  Stats,
  BatchScoreEntry,
  BatchScoresResponse,
  ScoreHistoryEntry,
  ScoreHistoryResponse,
  SubmitFeedbackParams,
  FeedbackResponse,
  ListWalletsOptions,
  ListWalletsResponse,
} from 'agentkarma'
```

## Error Handling

All errors are thrown as `AgentKarmaError` with a `status` property:

```typescript
import { AgentKarma, AgentKarmaError } from 'agentkarma'

try {
  await karma.getScore('0x...')
} catch (err) {
  if (err instanceof AgentKarmaError) {
    console.log(err.message)  // 'HTTP 404: Wallet not found'
    console.log(err.status)   // 404 (0 for network/timeout errors)
  }
}
```

| Status | Meaning |
| --- | --- |
| `400` | Invalid address format or bad request |
| `401` | Invalid or missing API key |
| `404` | Wallet not found |
| `429` | Rate limit exceeded |
| `500` | Server error |
| `0` | Network error or timeout |

## License

MIT
