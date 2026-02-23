/** Trust score tier */
export type ScoreTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'

/** Score breakdown by signal */
export interface ScoreBreakdown {
  loyalty: number
  activity: number
  diversity: number
  feedback: number
  age: number
  recency: number
  registered_bonus: number
}

/** Trust score result */
export interface TrustScore {
  address: string
  score: number
  tier: ScoreTier
  breakdown: ScoreBreakdown
  scored_at: string
}

/** Wallet info */
export interface Wallet {
  address: string
  source: string
  chain: string
  erc8004_id: number | null
  tx_count: number
  first_seen_at: string
  last_seen_at: string
  trust_score: number | null
  score_breakdown: ScoreBreakdown | null
}

/** Leaderboard entry */
export interface LeaderboardEntry {
  address: string
  trust_score: number
  source: string
  tx_count: number
  score_breakdown: ScoreBreakdown
}

/** Transaction record */
export interface Transaction {
  tx_hash: string
  block_number: number
  chain: string
  payer: string | null
  recipient: string | null
  amount_usdc: string | null
  is_x402: boolean
  block_timestamp: string | null
}

/** Paginated response */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}

/** Stats response */
export interface Stats {
  wallets: number
  transactions: number
  feedback_entries: number
  db_size_mb: string
  version: string
  score_distribution?: {
    tier: string
    count: number
    avg_score: number
  }[]
}

/** Client options */
export interface AgentKarmaOptions {
  /** API base URL. Defaults to the public API. */
  baseUrl?: string
  /** Request timeout in ms. Default: 10000 */
  timeout?: number
}
