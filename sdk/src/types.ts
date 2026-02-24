/** Trust score tier */
export type ScoreTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL'

/** Wallet role derived from transaction direction */
export type WalletRole = 'buyer' | 'seller' | 'both'

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

/** Trust score result from /score/:address */
export interface TrustScore {
  address: string
  trust_score: number | null
  tier: ScoreTier | null
  breakdown: ScoreBreakdown | null
  scored_at: string | null
  source: string
  tx_count: number
  role: WalletRole | null
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
  scored_at: string | null
  role: WalletRole | null
}

/** Wallet stats from /wallet/:address */
export interface WalletStats {
  transactions: number
  feedback: number
}

/** Full response from /wallet/:address */
export interface WalletLookupResponse {
  wallet: Wallet
  stats: WalletStats
}

/** Leaderboard entry from /leaderboard */
export interface LeaderboardEntry {
  rank: number
  address: string
  trust_score: number
  source: string
  tx_count: number
  score_breakdown: ScoreBreakdown
  first_seen_at: string
  last_seen_at: string
  role: WalletRole | null
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

/** Response from /wallet/:address/transactions */
export interface TransactionsResponse {
  transactions: Transaction[]
}

/** Wallet source count from /stats */
export interface WalletSourceCount {
  source: string
  count: number
}

/** Score distribution entry from /stats */
export interface ScoreDistributionEntry {
  tier: string
  count: number
  avg_score: number
}

/** Indexer state entry from /stats */
export interface IndexerStateEntry {
  id: number
  [key: string]: unknown
}

/** Stats response from /stats */
export interface Stats {
  wallets: WalletSourceCount[]
  transactions: number
  feedback: number
  score_distribution: ScoreDistributionEntry[]
  db_size_mb: string
  db_limit_mb: number
  indexer_state: IndexerStateEntry[]
}

/** Client options */
export interface AgentKarmaOptions {
  /** API base URL. Defaults to the public API. */
  baseUrl?: string
  /** Request timeout in ms. Default: 10000 */
  timeout?: number
}
