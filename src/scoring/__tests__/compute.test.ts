import { describe, it, expect, vi } from 'vitest'

// Mock sql as a tagged template function so the main() CLI call doesn't crash
vi.mock('../../db/client.js', () => ({
  default: Object.assign(
    () => Promise.resolve([]),
    { end: () => Promise.resolve() },
  ),
}))

import {
  ageScore,
  activityScore,
  diversityScore,
  loyaltyScore,
  recencyScore,
  feedbackScore,
  volumeScore,
  computeScore,
  WEIGHTS,
  type WalletSignals,
} from '../compute.js'

// Helper: date N days ago
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function makeWallet(overrides: Partial<WalletSignals> = {}): WalletSignals {
  return {
    address: '0x0000000000000000000000000000000000000001',
    tx_count: 10,
    first_seen_at: daysAgo(90),
    last_seen_at: daysAgo(1),
    unique_counterparties: 5,
    avg_feedback: 4.0,
    feedback_count: 10,
    total_volume_usdc: 1000,
    volume_counterparties: 5,
    is_registered: false,
    ...overrides,
  }
}

// --- Weights ---

describe('WEIGHTS', () => {
  it('should sum to 1.0', () => {
    const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0)
  })

  it('should have 7 entries', () => {
    expect(Object.keys(WEIGHTS)).toHaveLength(7)
  })
})

// --- ageScore (log-scale) ---

describe('ageScore', () => {
  it('returns 0 for invalid date', () => {
    expect(ageScore(new Date('invalid'))).toBe(0)
  })

  it('returns 0 for future date', () => {
    expect(ageScore(new Date(Date.now() + 86400000))).toBe(0)
  })

  it('returns 100 at 180 days', () => {
    expect(ageScore(daysAgo(180))).toBe(100)
  })

  it('caps at 100 for very old wallets', () => {
    expect(ageScore(daysAgo(365))).toBe(100)
  })

  it('returns ~86 at 90 days (log-scale)', () => {
    const score = ageScore(daysAgo(90))
    expect(score).toBeGreaterThan(83)
    expect(score).toBeLessThan(90)
  })

  it('returns ~44 at 10 days', () => {
    const score = ageScore(daysAgo(10))
    expect(score).toBeGreaterThan(40)
    expect(score).toBeLessThan(50)
  })

  it('returns 0 for brand new wallet', () => {
    expect(ageScore(new Date())).toBeCloseTo(0, 0)
  })
})

// --- activityScore ---

describe('activityScore', () => {
  it('returns 0 for 0 txns', () => {
    expect(activityScore(0)).toBe(0)
  })

  it('returns 0 for negative txns', () => {
    expect(activityScore(-5)).toBe(0)
  })

  it('returns 100 at 100 txns', () => {
    expect(activityScore(100)).toBeCloseTo(100, 0)
  })

  it('returns ~50 at 10 txns', () => {
    const score = activityScore(10)
    expect(score).toBeGreaterThan(45)
    expect(score).toBeLessThan(55)
  })

  it('caps above 100 txns', () => {
    expect(activityScore(1000)).toBe(100)
  })
})

// --- diversityScore ---

describe('diversityScore', () => {
  it('returns 0 for 0 counterparties', () => {
    expect(diversityScore(0)).toBe(0)
  })

  it('returns 0 for negative', () => {
    expect(diversityScore(-3)).toBe(0)
  })

  it('returns 100 at 30 counterparties', () => {
    expect(diversityScore(30)).toBeCloseTo(100, 0)
  })

  it('caps above 30', () => {
    expect(diversityScore(100)).toBe(100)
  })
})

// --- loyaltyScore ---

describe('loyaltyScore', () => {
  it('returns 0 for 0 or 1 txn', () => {
    expect(loyaltyScore(0, 0)).toBe(0)
    expect(loyaltyScore(1, 1)).toBe(0)
  })

  it('returns 0 for 0 counterparties', () => {
    expect(loyaltyScore(10, 0)).toBe(0)
  })

  it('returns 25 for avg 2 txns per partner', () => {
    // 10 txns / 5 partners = 2.0 avg → (2-1)/4 * 100 = 25
    expect(loyaltyScore(10, 5)).toBe(25)
  })

  it('returns 100 for avg 5 txns per partner', () => {
    // 50 txns / 10 partners = 5.0 avg → (5-1)/4 * 100 = 100
    expect(loyaltyScore(50, 10)).toBe(100)
  })

  it('caps Sybil pattern at 40', () => {
    // 100 txns with 2 partners = 50 avg, but only 2 counterparties → capped
    const score = loyaltyScore(100, 2)
    expect(score).toBeLessThanOrEqual(40)
  })

  it('does not apply Sybil cap when counterparties >= 3', () => {
    // 60 txns / 3 partners = 20 avg → not capped (counterparties >= 3)
    const score = loyaltyScore(60, 3)
    expect(score).toBe(100) // (20-1)/4 * 100 = 475, capped to 100
  })
})

// --- recencyScore ---

describe('recencyScore', () => {
  it('returns 100 if active today', () => {
    expect(recencyScore(new Date())).toBe(100)
  })

  it('returns 100 if active within 7 days', () => {
    expect(recencyScore(daysAgo(5))).toBe(100)
  })

  it('returns 0 if inactive 90+ days', () => {
    expect(recencyScore(daysAgo(90))).toBe(0)
  })

  it('returns 0 for invalid date', () => {
    expect(recencyScore(new Date('invalid'))).toBe(0)
  })

  it('returns 100 for future date', () => {
    expect(recencyScore(new Date(Date.now() + 86400000))).toBe(100)
  })

  it('decays between 7 and 90 days', () => {
    const score = recencyScore(daysAgo(48))
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(100)
  })
})

// --- feedbackScore ---

describe('feedbackScore', () => {
  it('returns 50 (neutral) with no feedback', () => {
    expect(feedbackScore(null, 0)).toBe(50)
  })

  it('returns 50 when count is 0', () => {
    expect(feedbackScore(4.5, 0)).toBe(50)
  })

  it('blends toward neutral with low count', () => {
    // 1 review of 5/5 → raw=100, confidence=0.1 → 0.1*100 + 0.9*50 = 55
    expect(feedbackScore(5, 1)).toBeCloseTo(55)
  })

  it('reaches full confidence at 10+ reviews', () => {
    // 10 reviews of 5/5 → raw=100, confidence=1.0 → 100
    expect(feedbackScore(5, 10)).toBe(100)
  })

  it('handles avg of 0', () => {
    expect(feedbackScore(0, 10)).toBe(0)
  })
})

// --- volumeScore ---

describe('volumeScore', () => {
  it('returns 50 (neutral) with no volume', () => {
    expect(volumeScore(0, 0)).toBe(50)
  })

  it('returns 50 with negative volume', () => {
    expect(volumeScore(-100, 5)).toBe(50)
  })

  it('returns ~50 for $100 avg deal size', () => {
    // $500 total / 5 counterparties = $100 avg → log10(101)/log10(10001) * 100 ≈ 50
    const score = volumeScore(500, 5)
    expect(score).toBeGreaterThan(45)
    expect(score).toBeLessThan(55)
  })

  it('returns 100 for $10K+ avg deal size', () => {
    expect(volumeScore(100000, 10)).toBe(100)
  })

  it('returns low score for tiny deals', () => {
    // $5 total / 5 counterparties = $1 avg
    const score = volumeScore(5, 5)
    expect(score).toBeLessThan(20)
  })
})

// --- computeScore ---

describe('computeScore', () => {
  it('returns a score between 0 and 100', () => {
    const { score } = computeScore(makeWallet())
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns all breakdown fields including volume', () => {
    const { breakdown } = computeScore(makeWallet())
    expect(breakdown).toHaveProperty('loyalty')
    expect(breakdown).toHaveProperty('activity')
    expect(breakdown).toHaveProperty('diversity')
    expect(breakdown).toHaveProperty('feedback')
    expect(breakdown).toHaveProperty('volume')
    expect(breakdown).toHaveProperty('age')
    expect(breakdown).toHaveProperty('recency')
    expect(breakdown).toHaveProperty('registered_bonus')
  })

  it('adds +5 bonus for registered agents', () => {
    const base = computeScore(makeWallet({ is_registered: false }))
    const registered = computeScore(makeWallet({ is_registered: true }))
    expect(registered.score).toBe(Math.min(100, base.score + 5))
    expect(registered.breakdown.registered_bonus).toBe(5)
  })

  it('does not add bonus for unregistered', () => {
    const { breakdown } = computeScore(makeWallet({ is_registered: false }))
    expect(breakdown.registered_bonus).toBe(0)
  })

  it('clamps at 0 for minimal wallet', () => {
    const { score } = computeScore(
      makeWallet({
        tx_count: 0,
        unique_counterparties: 0,
        first_seen_at: new Date(),
        last_seen_at: daysAgo(100),
        avg_feedback: null,
        feedback_count: 0,
        total_volume_usdc: 0,
        volume_counterparties: 0,
        is_registered: false,
      }),
    )
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('clamps at 100 for maximal wallet', () => {
    const { score } = computeScore(
      makeWallet({
        tx_count: 1000,
        unique_counterparties: 100,
        first_seen_at: daysAgo(365),
        last_seen_at: new Date(),
        avg_feedback: 5,
        feedback_count: 100,
        total_volume_usdc: 100000,
        volume_counterparties: 10,
        is_registered: true,
      }),
    )
    expect(score).toBeLessThanOrEqual(100)
  })

  it('breakdown values are rounded integers', () => {
    const { breakdown } = computeScore(makeWallet())
    for (const [key, val] of Object.entries(breakdown)) {
      expect(val, `${key} should be integer`).toBe(Math.round(val))
    }
  })

  it('volume defaults to neutral (50) when no volume data', () => {
    const { breakdown } = computeScore(makeWallet({
      total_volume_usdc: 0,
      volume_counterparties: 0,
    }))
    expect(breakdown.volume).toBe(50)
  })
})
