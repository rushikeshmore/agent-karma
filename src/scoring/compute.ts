/**
 * AgentKarma Trust Score Engine v2
 *
 * Computes a 0–100 trust score per wallet based on on-chain signals.
 * Runs as a CLI script: reads from DB, computes scores, writes back.
 *
 * Algorithm grounded in:
 *   - EigenTrust (Stanford, 2003) — repeat interaction = strongest trust signal
 *   - zScore DeFi reputation (arXiv 2507.20494) — log-based normalization for tx counts
 *   - Gitcoin Passport — age is weak signal, commitment matters more
 *   - Arbitrum Sybil detection — cap suspiciously concentrated patterns
 *
 * Score components (weighted):
 *   - Loyalty score    (32%) — repeat business ratio (core differentiator)
 *   - Activity score   (20%) — transaction count, log scale
 *   - Diversity score  (18%) — unique counterparties, log scale
 *   - Feedback score   (15%) — on-chain reputation, confidence-weighted
 *   - Age score         (9%) — time since first on-chain appearance
 *   - Recency score     (6%) — how recently active
 *
 * Bonus: +5 for ERC-8004 registered agents (on-chain identity commitment)
 */

import sql from '../db/client.js'

// --- Weights (must sum to 1.0) ---
export const WEIGHTS = {
  loyalty: 0.32,
  activity: 0.20,
  diversity: 0.18,
  feedback: 0.15,
  age: 0.09,
  recency: 0.06,
}

// --- Scoring functions (each returns 0–100) ---

/** Age: days since first_seen_at. Caps at 180 days for full score. */
export function ageScore(firstSeenAt: Date): number {
  if (isNaN(firstSeenAt.getTime())) return 0
  const days = (Date.now() - firstSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  if (days < 0) return 0
  return Math.min(100, (days / 180) * 100)
}

/**
 * Activity: tx_count on log10(x+1) scale.
 * 0→0, 1→17, 5→38, 10→50, 50→83, 100→100
 * Raised cap to 100 txns (was 50) per zScore research.
 */
export function activityScore(txCount: number): number {
  if (txCount <= 0) return 0
  return Math.min(100, (Math.log10(txCount + 1) / Math.log10(101)) * 100)
}

/**
 * Diversity: unique counterparties on log10(x+1) scale.
 * 0→0, 1→21, 5→47, 10→67, 20→89, 30→100
 */
export function diversityScore(uniqueCounterparties: number): number {
  if (uniqueCounterparties <= 0) return 0
  return Math.min(100, (Math.log10(uniqueCounterparties + 1) / Math.log10(31)) * 100)
}

/**
 * Loyalty: repeat business ratio with Sybil resistance.
 * Measures avgTxPerPartner — higher = more repeat business.
 * Caps score for suspiciously concentrated patterns (Sybil rings).
 */
export function loyaltyScore(txCount: number, uniqueCounterparties: number): number {
  if (txCount <= 1 || uniqueCounterparties === 0) return 0
  const avgTxPerPartner = txCount / uniqueCounterparties

  // Sybil check: unrealistically high loyalty with very few counterparties
  // e.g. 100 txns with only 2 partners = suspicious ring
  if (avgTxPerPartner > 20 && uniqueCounterparties < 3) {
    return Math.min(40, ((avgTxPerPartner - 1) / 4) * 100)
  }

  // 1.0 = no repeats (0), 2.0 = each partner twice (25), 5.0 = five times (100)
  return Math.min(100, ((avgTxPerPartner - 1) / 4) * 100)
}

/**
 * Recency: days since last activity. Gentler decay than v1.
 * Full score if active in last 7 days, 0 if inactive 90+ days.
 */
export function recencyScore(lastSeenAt: Date): number {
  if (isNaN(lastSeenAt.getTime())) return 0
  const days = (Date.now() - lastSeenAt.getTime()) / (1000 * 60 * 60 * 24)
  if (days < 0) return 100
  if (days <= 7) return 100
  if (days >= 90) return 0
  return Math.max(0, 100 - ((days - 7) / 83) * 100)
}

/**
 * Feedback: confidence-weighted average.
 * An agent with 50 four-star reviews scores higher than one with 1 five-star.
 * Blends toward neutral (50) when feedback count is low.
 */
export function feedbackScore(avgFeedback: number | null, feedbackCount: number): number {
  if (feedbackCount === 0 || avgFeedback === null) return 50 // neutral
  const rawScore = Math.min(100, (avgFeedback / 5) * 100)
  const confidence = Math.min(1, feedbackCount / 10) // full confidence at 10+ reviews
  return confidence * rawScore + (1 - confidence) * 50
}

// --- Main compute function ---

export interface WalletSignals {
  address: string
  tx_count: number
  first_seen_at: Date
  last_seen_at: Date
  unique_counterparties: number
  avg_feedback: number | null
  feedback_count: number
  is_registered: boolean // ERC-8004 identity
}

export function computeScore(w: WalletSignals): {
  score: number
  breakdown: Record<string, number>
} {
  const age = ageScore(w.first_seen_at)
  const activity = activityScore(w.tx_count)
  const diversity = diversityScore(w.unique_counterparties)
  const loyalty = loyaltyScore(w.tx_count, w.unique_counterparties)
  const recency = recencyScore(w.last_seen_at)
  const feedback = feedbackScore(w.avg_feedback, w.feedback_count)

  let score = Math.round(
    loyalty * WEIGHTS.loyalty +
    activity * WEIGHTS.activity +
    diversity * WEIGHTS.diversity +
    feedback * WEIGHTS.feedback +
    age * WEIGHTS.age +
    recency * WEIGHTS.recency
  )

  // ERC-8004 registration bonus: on-chain identity commitment costs gas
  if (w.is_registered) {
    score += 5
  }

  score = Math.max(0, Math.min(100, score))

  return {
    score,
    breakdown: {
      loyalty: Math.round(loyalty),
      activity: Math.round(activity),
      diversity: Math.round(diversity),
      feedback: Math.round(feedback),
      age: Math.round(age),
      recency: Math.round(recency),
      registered_bonus: w.is_registered ? 5 : 0,
    },
  }
}

// --- CLI: compute scores for all wallets ---

async function main() {
  console.log('AgentKarma Trust Score Engine v2\n')
  console.log('Weights: loyalty=32%, activity=20%, diversity=18%, feedback=15%, age=9%, recency=6%')
  console.log('Bonus: +5 for ERC-8004 registered agents\n')

  // Add score + role columns if missing
  await sql`
    ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS trust_score INTEGER,
    ADD COLUMN IF NOT EXISTS score_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS role VARCHAR(10)
  `

  // Batch: get all wallets
  const wallets = await sql`SELECT * FROM wallets ORDER BY id`
  console.log(`Found ${wallets.length} wallets`)

  // Batch: precompute counterparty counts for all wallets with transactions
  console.log('Precomputing counterparty stats...')
  const counterpartyStats = await sql`
    SELECT
      addr,
      COUNT(DISTINCT counterparty)::int as unique_counterparties
    FROM (
      SELECT payer as addr, recipient as counterparty FROM transactions
      UNION ALL
      SELECT recipient as addr, payer as counterparty FROM transactions
    ) t
    WHERE counterparty IS NOT NULL
    GROUP BY addr
  `
  const cpMap = new Map<string, number>()
  for (const row of counterpartyStats) {
    cpMap.set(row.addr, row.unique_counterparties)
  }
  console.log(`  ${cpMap.size} wallets have transaction counterparties`)

  // Batch: precompute feedback stats
  console.log('Precomputing feedback stats...')
  const feedbackStats = await sql`
    SELECT
      w.address,
      COUNT(*)::int as count,
      AVG(f.value::float) as avg_value
    FROM feedback f
    JOIN wallets w ON f.agent_id = w.erc8004_id
    GROUP BY w.address
  `
  const fbMap = new Map<string, { count: number; avg: number }>()
  for (const row of feedbackStats) {
    fbMap.set(row.address, { count: row.count, avg: Number(row.avg_value) })
  }
  console.log(`  ${fbMap.size} wallets have feedback`)

  // Batch: precompute wallet roles (buyer/seller/both)
  console.log('Precomputing wallet roles...')
  const roleStats = await sql`
    SELECT
      addr,
      SUM(CASE WHEN dir = 'payer' THEN 1 ELSE 0 END)::int as payer_count,
      SUM(CASE WHEN dir = 'recipient' THEN 1 ELSE 0 END)::int as recipient_count
    FROM (
      SELECT payer as addr, 'payer' as dir FROM transactions WHERE payer IS NOT NULL
      UNION ALL
      SELECT recipient as addr, 'recipient' as dir FROM transactions WHERE recipient IS NOT NULL
    ) t
    GROUP BY addr
  `
  const roleMap = new Map<string, 'buyer' | 'seller' | 'both'>()
  for (const row of roleStats) {
    if (row.payer_count > 0 && row.recipient_count > 0) {
      roleMap.set(row.addr, 'both')
    } else if (row.payer_count > 0) {
      roleMap.set(row.addr, 'buyer')
    } else {
      roleMap.set(row.addr, 'seller')
    }
  }
  console.log(`  ${roleMap.size} wallets have roles (buyer/seller/both)\n`)

  // Score all wallets in memory, then bulk UPDATE
  const startTime = Date.now()
  const BATCH_SIZE = 500 // larger batches — each is ONE sql statement

  // Compute all scores in memory (instant)
  const results: { address: string; score: number; breakdown: string; role: string | null }[] = []
  for (const w of wallets) {
    const cp = cpMap.get(w.address) ?? 0
    const fb = fbMap.get(w.address)

    const signals: WalletSignals = {
      address: w.address,
      tx_count: w.tx_count,
      first_seen_at: new Date(w.first_seen_at),
      last_seen_at: new Date(w.last_seen_at),
      unique_counterparties: cp,
      avg_feedback: fb?.avg ?? null,
      feedback_count: fb?.count ?? 0,
      is_registered: w.erc8004_id !== null,
    }

    const { score, breakdown } = computeScore(signals)
    results.push({
      address: w.address,
      score,
      breakdown: JSON.stringify(breakdown),
      role: roleMap.get(w.address) ?? null,
    })
  }
  console.log(`Computed ${results.length} scores in memory`)

  // Bulk UPDATE using parameterized queries — one SQL statement per batch (not per row)
  console.log(`Writing scores in bulk batches of ${BATCH_SIZE}...`)
  let written = 0
  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE)

    let retries = 3
    while (retries > 0) {
      try {
        // Use parameterized queries for safe bulk updates
        for (const b of batch) {
          await sql`
            UPDATE wallets SET
              trust_score = ${b.score},
              score_breakdown = ${b.breakdown}::jsonb,
              scored_at = NOW(),
              role = ${b.role}
            WHERE address = ${b.address}
          `
        }
        break // success
      } catch (err: any) {
        retries--
        if (retries > 0 && (err.code === 'ETIMEDOUT' || err.code === 'CONNECTION_CLOSED' || err.code === 'CONNECT_TIMEOUT')) {
          console.log(`  Connection error at batch ${i / BATCH_SIZE + 1}, retrying in 3s... (${retries} left)`)
          await new Promise(r => setTimeout(r, 3000))
        } else {
          throw err
        }
      }
    }

    written += batch.length
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
    console.log(`  Written ${written}/${results.length} (${elapsed}s)`)
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\nDone. Scored ${results.length} wallets in ${totalTime}s.`)

  // Show score distribution
  const dist = await sql`
    SELECT
      CASE
        WHEN trust_score >= 80 THEN 'A  high (80-100)'
        WHEN trust_score >= 50 THEN 'B  medium (50-79)'
        WHEN trust_score >= 20 THEN 'C  low (20-49)'
        ELSE 'D  minimal (0-19)'
      END as tier,
      COUNT(*)::int as count,
      ROUND(AVG(trust_score)) as avg_score
    FROM wallets
    WHERE trust_score IS NOT NULL
    GROUP BY tier
    ORDER BY tier
  `
  console.log('\nScore Distribution:')
  console.log('  Tier             | Count  | Avg Score')
  console.log('  -----------------+--------+----------')
  for (const row of dist) {
    console.log(`  ${row.tier.padEnd(17)}| ${String(row.count).padStart(6)} | ${row.avg_score}`)
  }

  // Show top 10
  const top = await sql`
    SELECT address, trust_score, score_breakdown, source, tx_count
    FROM wallets
    WHERE trust_score IS NOT NULL
    ORDER BY trust_score DESC
    LIMIT 10
  `
  console.log('\nTop 10 wallets:')
  for (const w of top) {
    console.log(`  ${String(w.trust_score).padStart(3)}/100 | ${w.address} | ${w.source} | ${w.tx_count} txns`)
    console.log(`         ${JSON.stringify(w.score_breakdown)}`)
  }

  // Show bottom 10 (for sanity check)
  const bottom = await sql`
    SELECT address, trust_score, score_breakdown, source, tx_count
    FROM wallets
    WHERE trust_score IS NOT NULL
    ORDER BY trust_score ASC
    LIMIT 5
  `
  console.log('\nBottom 5 wallets (sanity check):')
  for (const w of bottom) {
    console.log(`  ${String(w.trust_score).padStart(3)}/100 | ${w.address} | ${w.source} | ${w.tx_count} txns`)
  }

  await sql.end()
}

main().catch((err) => {
  console.error('Scoring failed:', err)
  process.exit(1)
})
