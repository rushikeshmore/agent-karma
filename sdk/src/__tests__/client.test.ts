import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentKarma, AgentKarmaError } from '../client.js'

const VALID_ADDRESS = '0x' + 'a'.repeat(40)

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

describe('AgentKarma SDK', () => {
  let karma: AgentKarma

  beforeEach(() => {
    karma = new AgentKarma({ baseUrl: 'https://test.api' })
  })

  // --- getScore ---

  describe('getScore', () => {
    it('returns trust score', async () => {
      const response = {
        address: VALID_ADDRESS,
        trust_score: 84,
        tier: 'HIGH',
        breakdown: { loyalty: 90, activity: 80, diversity: 70, feedback: 60, age: 50, recency: 100, registered_bonus: 5 },
        scored_at: '2026-01-01T00:00:00Z',
        source: 'erc8004',
        tx_count: 42,
        role: 'seller',
      }
      globalThis.fetch = mockFetch(response)

      const result = await karma.getScore(VALID_ADDRESS)
      expect(result.trust_score).toBe(84)
      expect(result.tier).toBe('HIGH')
      expect(result.source).toBe('erc8004')
      expect(result.tx_count).toBe(42)
      expect(result.role).toBe('seller')
    })

    it('throws on invalid address', async () => {
      await expect(karma.getScore('not-an-address')).rejects.toThrow(AgentKarmaError)
    })
  })

  // --- isHighTrust ---

  describe('isHighTrust', () => {
    it('returns true for HIGH tier', async () => {
      globalThis.fetch = mockFetch({ trust_score: 85, tier: 'HIGH' })
      expect(await karma.isHighTrust(VALID_ADDRESS)).toBe(true)
    })

    it('returns false for non-HIGH tier', async () => {
      globalThis.fetch = mockFetch({ trust_score: 60, tier: 'MEDIUM' })
      expect(await karma.isHighTrust(VALID_ADDRESS)).toBe(false)
    })
  })

  // --- meetsThreshold ---

  describe('meetsThreshold', () => {
    it('returns true when trust_score >= threshold', async () => {
      globalThis.fetch = mockFetch({ trust_score: 75 })
      expect(await karma.meetsThreshold(VALID_ADDRESS, 50)).toBe(true)
    })

    it('returns false when trust_score < threshold', async () => {
      globalThis.fetch = mockFetch({ trust_score: 30 })
      expect(await karma.meetsThreshold(VALID_ADDRESS, 50)).toBe(false)
    })

    it('treats null trust_score as 0', async () => {
      globalThis.fetch = mockFetch({ trust_score: null })
      expect(await karma.meetsThreshold(VALID_ADDRESS, 1)).toBe(false)
    })
  })

  // --- lookupWallet ---

  describe('lookupWallet', () => {
    it('returns wallet + stats', async () => {
      const response = {
        wallet: { address: VALID_ADDRESS, source: 'x402', chain: 'base', tx_count: 5 },
        stats: { transactions: 5, feedback: 2 },
      }
      globalThis.fetch = mockFetch(response)

      const result = await karma.lookupWallet(VALID_ADDRESS)
      expect(result.wallet.address).toBe(VALID_ADDRESS)
      expect(result.stats.transactions).toBe(5)
      expect(result.stats.feedback).toBe(2)
    })
  })

  // --- getTransactions ---

  describe('getTransactions', () => {
    it('returns transactions array', async () => {
      const txs = [{ tx_hash: '0xabc', block_number: 123, chain: 'base' }]
      globalThis.fetch = mockFetch({ transactions: txs })

      const result = await karma.getTransactions(VALID_ADDRESS)
      expect(result.transactions).toHaveLength(1)
      expect(result.transactions[0].tx_hash).toBe('0xabc')
    })

    it('sends limit and offset params (not page/per_page)', async () => {
      globalThis.fetch = mockFetch({ transactions: [] })

      await karma.getTransactions(VALID_ADDRESS, { limit: 10, offset: 20 })

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(calledUrl).toContain('limit=10')
      expect(calledUrl).toContain('offset=20')
      expect(calledUrl).not.toContain('page=')
      expect(calledUrl).not.toContain('per_page=')
    })
  })

  // --- getLeaderboard ---

  describe('getLeaderboard', () => {
    it('unwraps leaderboard array from response', async () => {
      const entries = [
        { rank: 1, address: VALID_ADDRESS, trust_score: 95 },
        { rank: 2, address: '0x' + 'b'.repeat(40), trust_score: 90 },
      ]
      globalThis.fetch = mockFetch({ leaderboard: entries })

      const result = await karma.getLeaderboard({ limit: 10 })
      expect(result).toHaveLength(2)
      expect(result[0].rank).toBe(1)
      expect(result[0].trust_score).toBe(95)
    })
  })

  // --- getStats ---

  describe('getStats', () => {
    it('returns full stats shape', async () => {
      const response = {
        wallets: [{ source: 'erc8004', count: 5000 }, { source: 'x402', count: 1200 }],
        transactions: 1992,
        feedback: 676,
        score_distribution: [{ tier: 'high', count: 100, avg_score: 88 }],
        db_size_mb: '13.2',
        db_limit_mb: 500,
        indexer_state: [{ id: 1 }],
      }
      globalThis.fetch = mockFetch(response)

      const result = await karma.getStats()
      expect(result.wallets).toHaveLength(2)
      expect(result.transactions).toBe(1992)
      expect(result.feedback).toBe(676)
      expect(result.db_limit_mb).toBe(500)
    })
  })

  // --- Error handling ---

  describe('error handling', () => {
    it('throws AgentKarmaError on HTTP error', async () => {
      globalThis.fetch = mockFetch({ error: 'Not found' }, 404)

      await expect(karma.getScore(VALID_ADDRESS)).rejects.toThrow(AgentKarmaError)
      try {
        await karma.getScore(VALID_ADDRESS)
      } catch (err) {
        expect((err as AgentKarmaError).status).toBe(404)
      }
    })

    it('throws AgentKarmaError on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failed'))
      await expect(karma.getScore(VALID_ADDRESS)).rejects.toThrow(AgentKarmaError)
    })

    it('throws on invalid address format', async () => {
      await expect(karma.getScore('0xinvalid')).rejects.toThrow('Invalid address')
      await expect(karma.getScore('')).rejects.toThrow('Invalid address')
    })
  })
})
