import type {
  AgentKarmaOptions,
  TrustScore,
  WalletLookupResponse,
  LeaderboardEntry,
  TransactionsResponse,
  Stats,
  BatchScoresResponse,
  ScoreHistoryResponse,
  SubmitFeedbackParams,
  FeedbackResponse,
  ListWalletsOptions,
  ListWalletsResponse,
  RegisterWebhookParams,
  RegisterWebhookResponse,
  ListWebhooksResponse,
  DeleteWebhookResponse,
} from './types.js'

const DEFAULT_BASE_URL = 'https://agent-karma.rushikeshmore271.workers.dev'
const DEFAULT_TIMEOUT = 10_000
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

function assertAddress(address: string): string {
  if (!ETH_ADDRESS_RE.test(address)) {
    throw new AgentKarmaError('Invalid address format. Expected 0x + 40 hex characters.', 0)
  }
  return address.toLowerCase()
}

export class AgentKarma {
  private baseUrl: string
  private timeout: number
  private apiKey: string | undefined

  constructor(options: AgentKarmaOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT
    this.apiKey = options.apiKey
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Accept': 'application/json' }
    if (this.apiKey) headers['x-api-key'] = this.apiKey
    return headers
  }

  private async fetch<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: this.getHeaders(),
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AgentKarmaError(
          `HTTP ${res.status}: ${text || res.statusText}`,
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
   * const { trust_score, tier } = await karma.getScore('0xABC...')
   * if (tier === 'HIGH') { // safe to transact }
   * ```
   */
  async getScore(address: string): Promise<TrustScore> {
    return this.fetch<TrustScore>(`/score/${assertAddress(address)}`)
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
    const { trust_score } = await this.getScore(address)
    return (trust_score ?? 0) >= minScore
  }

  /**
   * Look up full wallet details including transaction and feedback stats.
   */
  async lookupWallet(address: string): Promise<WalletLookupResponse> {
    return this.fetch<WalletLookupResponse>(`/wallet/${assertAddress(address)}`)
  }

  /**
   * Get transaction history for a wallet.
   */
  async getTransactions(
    address: string,
    options?: { limit?: number; offset?: number },
  ): Promise<TransactionsResponse> {
    const limit = options?.limit ?? 25
    const offset = options?.offset ?? 0
    return this.fetch<TransactionsResponse>(
      `/wallet/${assertAddress(address)}/transactions?limit=${limit}&offset=${offset}`,
    )
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
    const res = await this.fetch<{ leaderboard: LeaderboardEntry[] }>(
      `/leaderboard${qs ? '?' + qs : ''}`,
    )
    return res.leaderboard
  }

  /**
   * Get platform stats (wallet count, transaction count, etc.)
   */
  async getStats(): Promise<Stats> {
    return this.fetch<Stats>('/stats')
  }

  /**
   * Get trust scores for multiple wallet addresses at once.
   *
   * @example
   * ```ts
   * const { scores, not_found } = await karma.batchScores(['0xABC...', '0xDEF...'])
   * ```
   */
  async batchScores(addresses: string[]): Promise<BatchScoresResponse> {
    const normalized = addresses.map(assertAddress)
    return this.post<BatchScoresResponse>('/wallets/batch-scores', { addresses: normalized })
  }

  /**
   * Get the score history for a wallet address.
   *
   * @example
   * ```ts
   * const { history } = await karma.getScoreHistory('0xABC...')
   * ```
   */
  async getScoreHistory(
    address: string,
    options?: { limit?: number },
  ): Promise<ScoreHistoryResponse> {
    const limit = options?.limit ?? 25
    return this.fetch<ScoreHistoryResponse>(
      `/wallet/${assertAddress(address)}/score-history?limit=${limit}`,
    )
  }

  /**
   * Submit feedback for a wallet's transaction.
   *
   * @example
   * ```ts
   * const { feedback_id } = await karma.submitFeedback({
   *   address: '0xABC...',
   *   tx_hash: '0x123...',
   *   rating: 5,
   *   comment: 'Fast and reliable',
   * })
   * ```
   */
  async submitFeedback(params: SubmitFeedbackParams): Promise<FeedbackResponse> {
    const normalized = assertAddress(params.address)
    return this.post<FeedbackResponse>('/feedback', { ...params, address: normalized })
  }

  /**
   * List indexed wallets with optional filters.
   *
   * @example
   * ```ts
   * const { wallets, total } = await karma.listWallets({ limit: 10, sort: 'score' })
   * ```
   */
  async listWallets(options?: ListWalletsOptions): Promise<ListWalletsResponse> {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    if (options?.source) params.set('source', options.source)
    if (options?.sort) params.set('sort', options.sort)
    if (options?.scoreMin != null) params.set('score_min', String(options.scoreMin))
    if (options?.scoreMax != null) params.set('score_max', String(options.scoreMax))
    const qs = params.toString()
    return this.fetch<ListWalletsResponse>(`/wallets${qs ? '?' + qs : ''}`)
  }

  private async delete<T>(path: string): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'DELETE',
        signal: controller.signal,
        headers: this.getHeaders(),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new AgentKarmaError(
          `HTTP ${res.status}: ${text || res.statusText}`,
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
   * Register a webhook to get notified on score changes.
   * Requires an API key (pass via constructor options).
   *
   * @example
   * ```ts
   * const karma = new AgentKarma({ apiKey: 'ak_...' })
   * const { webhook } = await karma.registerWebhook({
   *   url: 'https://myapp.com/webhook',
   *   event_type: 'score_drop',
   *   threshold: 50,
   * })
   * ```
   */
  async registerWebhook(params: RegisterWebhookParams): Promise<RegisterWebhookResponse> {
    return this.post<RegisterWebhookResponse>('/webhooks', params)
  }

  /**
   * List all webhooks registered under your API key.
   */
  async listWebhooks(): Promise<ListWebhooksResponse> {
    return this.fetch<ListWebhooksResponse>('/webhooks')
  }

  /**
   * Delete a webhook by ID.
   */
  async deleteWebhook(id: number): Promise<DeleteWebhookResponse> {
    return this.delete<DeleteWebhookResponse>(`/webhooks/${id}`)
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
