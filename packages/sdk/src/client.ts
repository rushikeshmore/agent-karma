import type {
  AgentKarmaOptions,
  TrustScore,
  Wallet,
  LeaderboardEntry,
  Transaction,
  PaginatedResponse,
  Stats,
} from './types.js'

const DEFAULT_BASE_URL = 'https://agent-karma.rushikeshmore271.workers.dev'
const DEFAULT_TIMEOUT = 10_000

export class AgentKarma {
  private baseUrl: string
  private timeout: number

  constructor(options: AgentKarmaOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
  }

  private async fetch<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new AgentKarmaError(
          `HTTP ${res.status}: ${body || res.statusText}`,
          res.status,
        )
      }

      return (await res.json()) as T
    } catch (err: any) {
      if (err instanceof AgentKarmaError) throw err
      if (err.name === 'AbortError') {
        throw new AgentKarmaError('Request timed out', 0)
      }
      throw new AgentKarmaError(err.message ?? 'Network error', 0)
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Get the trust score for a wallet address.
   *
   * @example
   * ```ts
   * const { score, tier } = await karma.getScore('0xABC...')
   * if (tier === 'HIGH') { // safe to transact }
   * ```
   */
  async getScore(address: string): Promise<TrustScore> {
    return this.fetch<TrustScore>(`/score/${address.toLowerCase()}`)
  }

  /**
   * Check if a wallet is high trust (score >= 80).
   *
   * @example
   * ```ts
   * if (await karma.isHighTrust('0xABC...')) {
   *   // proceed with transaction
   * }
   * ```
   */
  async isHighTrust(address: string): Promise<boolean> {
    const { tier } = await this.getScore(address)
    return tier === 'HIGH'
  }

  /**
   * Check if a wallet meets a minimum score threshold.
   *
   * @example
   * ```ts
   * if (await karma.meetsThreshold('0xABC...', 50)) {
   *   // score is at least 50
   * }
   * ```
   */
  async meetsThreshold(address: string, minScore: number): Promise<boolean> {
    const { score } = await this.getScore(address)
    return score >= minScore
  }

  /**
   * Look up full wallet details.
   */
  async lookupWallet(address: string): Promise<Wallet> {
    const res = await this.fetch<{ wallet: Wallet }>(`/wallet/${address.toLowerCase()}`)
    return res.wallet
  }

  /**
   * Get transaction history for a wallet.
   */
  async getTransactions(
    address: string,
    options?: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<Transaction>> {
    const page = options?.page ?? 1
    const limit = options?.limit ?? 50
    return this.fetch(`/wallet/${address.toLowerCase()}/transactions?page=${page}&per_page=${limit}`)
  }

  /**
   * Get the leaderboard of top-scoring wallets.
   */
  async getLeaderboard(options?: {
    limit?: number
    source?: 'erc8004' | 'x402' | 'both'
  }): Promise<LeaderboardEntry[]> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.source) params.set('source', options.source)
    const qs = params.toString()
    return this.fetch<LeaderboardEntry[]>(`/leaderboard${qs ? '?' + qs : ''}`)
  }

  /**
   * Get platform stats (wallet count, transaction count, etc.)
   */
  async getStats(): Promise<Stats> {
    return this.fetch<Stats>('/stats')
  }
}

export class AgentKarmaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'AgentKarmaError'
  }
}
