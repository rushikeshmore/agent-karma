/**
 * AgentKarma API — Cloudflare Workers entry point.
 *
 * Uses @neondatabase/serverless (HTTP mode) instead of postgres.js
 * since Workers don't support raw TCP sockets.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { neon } from '@neondatabase/serverless'

interface RateLimitOutcome {
  success: boolean
}
interface RateLimit {
  limit(options: { key: string }): Promise<RateLimitOutcome>
}

type Bindings = {
  DATABASE_URL: string
  RATE_LIMITER: RateLimit
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({
  origin: ['https://agentkarma.dev', 'https://www.agentkarma.dev', 'http://localhost:3000', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-api-key'],
}))

app.onError((err, c) => {
  console.error(`[API Error] ${c.req.method} ${c.req.path}:`, err.message)
  return c.json({ error: 'Internal server error' }, 500)
})

// --- Burst rate limiting (Cloudflare Workers Rate Limiting Binding) ---
// 25 requests per 10 seconds per IP. Catches scrapers/bots. Zero latency.
app.use('*', async (c, next) => {
  const path = c.req.path
  if (path === '/' || path === '/openapi.json' || path === '/openai-functions.json') return next()

  if (c.env.RATE_LIMITER) {
    const ip = c.req.header('cf-connecting-ip') || 'unknown'
    const { success } = await c.env.RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return c.json({
        error: 'Too many requests. Slow down.',
        retry_after: 10,
      }, 429)
    }
  }

  return next()
})

// --- API key rate limiting (DB-tracked daily limits) ---
// Anonymous requests pass through (burst limiter above is sufficient)
// API key requests: tracked in DB for per-key daily limits

app.use('*', async (c, next) => {
  const path = c.req.path
  if (path === '/' || path === '/api-keys' || path === '/openapi.json' || path === '/openai-functions.json') return next()

  const sql = getSQL(c)
  const apiKey = c.req.header('x-api-key')

  if (apiKey) {
    const keys = await sql`SELECT id, tier, daily_limit, is_active FROM api_keys WHERE key = ${apiKey}`
    if (keys.length === 0) return c.json({ error: 'Invalid API key' }, 401)
    if (!keys[0].is_active) return c.json({ error: 'API key is inactive' }, 403)

    const keyId = keys[0].id
    const dailyLimit = keys[0].daily_limit

    const usage = await sql`
      INSERT INTO api_usage (api_key_id, date, request_count)
      VALUES (${keyId}, CURRENT_DATE, 1)
      ON CONFLICT (api_key_id, date) DO UPDATE SET request_count = api_usage.request_count + 1
      RETURNING request_count
    `

    if (usage[0].request_count > dailyLimit) {
      return c.json({ error: 'Daily rate limit exceeded', limit: dailyLimit, tier: keys[0].tier }, 429)
    }
  }
  // Anonymous requests pass through — rate limiting handled by Cloudflare

  return next()
})

// OpenAPI spec — redirect to GitHub raw
app.get('/openapi.json', (c) => {
  return c.redirect('https://raw.githubusercontent.com/rushikeshmore/agent-karma/main/openapi.yaml')
})

// OpenAI function-calling schema — redirect to GitHub raw
app.get('/openai-functions.json', (c) => {
  return c.redirect('https://raw.githubusercontent.com/rushikeshmore/agent-karma/main/openai-functions.json')
})

const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

function validateAddress(address: string): string | null {
  return ETH_ADDRESS_RE.test(address) ? address.toLowerCase() : null
}

function safeInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isNaN(n) || n < 0 ? fallback : Math.floor(n)
}

const VALID_SOURCES = new Set(['erc8004', 'x402', 'both'])

function validateSource(source: string | undefined): string | undefined {
  return source && VALID_SOURCES.has(source) ? source : undefined
}

// Helper: create a per-request SQL function
function getSQL(c: { env: Bindings }) {
  return neon(c.env.DATABASE_URL)
}

// Health check
app.get('/', (c) =>
  c.json({
    name: 'AgentKarma',
    version: '0.5.0',
    description: 'Credit bureau for AI agent wallets',
    runtime: 'cloudflare-workers',
  })
)

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

function computeTier(score: number): string {
  return score >= 80 ? 'HIGH' : score >= 50 ? 'MEDIUM' : score >= 20 ? 'LOW' : 'MINIMAL'
}

// Batch scores — look up multiple wallets at once
app.post('/wallets/batch-scores', async (c) => {
  const sql = getSQL(c)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const { addresses } = body

  if (!Array.isArray(addresses) || addresses.length === 0) {
    return c.json({ error: 'addresses must be a non-empty array' }, 400)
  }
  if (addresses.length > 100) {
    return c.json({ error: 'Maximum 100 addresses per request' }, 400)
  }

  const normalized: string[] = []
  for (const addr of addresses) {
    if (typeof addr !== 'string' || !ETH_ADDRESS_RE.test(addr)) {
      return c.json({ error: `Invalid address: ${addr}` }, 400)
    }
    normalized.push(addr.toLowerCase())
  }

  const wallets = await sql`
    SELECT address, trust_score, score_breakdown, scored_at, role
    FROM wallets WHERE address = ANY(${normalized})
  `

  const foundMap = new Map<string, any>()
  for (const w of wallets) {
    foundMap.set(w.address, {
      ...w,
      tier: w.trust_score != null ? computeTier(w.trust_score) : null,
    })
  }

  const scores = normalized.filter((a) => foundMap.has(a)).map((a) => foundMap.get(a))
  const not_found = normalized.filter((a) => !foundMap.has(a))

  return c.json({ scores, not_found })
})

// Submit feedback for a transaction
app.post('/feedback', async (c) => {
  const sql = getSQL(c)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const { address, tx_hash, rating, comment } = body

  if (comment != null && (typeof comment !== 'string' || comment.length > 1000)) {
    return c.json({ error: 'comment must be a string with max 1000 characters' }, 400)
  }

  const validAddress = typeof address === 'string' ? validateAddress(address) : null
  if (!validAddress) return c.json({ error: 'Invalid address format. Expected 0x + 40 hex characters.' }, 400)

  if (typeof tx_hash !== 'string' || !TX_HASH_RE.test(tx_hash)) {
    return c.json({ error: 'Invalid tx_hash format. Expected 0x + 64 hex characters.' }, 400)
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return c.json({ error: 'rating must be an integer between 1 and 5' }, 400)
  }

  // Verify transaction exists
  const txRows = await sql`
    SELECT payer, recipient, block_number FROM transactions WHERE tx_hash = ${tx_hash.toLowerCase()}
  `
  if (txRows.length === 0) return c.json({ error: 'Transaction not found' }, 404)

  const tx = txRows[0]

  // Verify address is payer or recipient
  if (tx.payer !== validAddress && tx.recipient !== validAddress) {
    return c.json({ error: 'Address is not a party to this transaction' }, 400)
  }

  // Look up target wallet's erc8004_id
  const walletRows = await sql`
    SELECT erc8004_id FROM wallets WHERE address = ${validAddress}
  `
  const agentId = walletRows.length > 0 && walletRows[0].erc8004_id != null
    ? walletRows[0].erc8004_id
    : 0

  const result = await sql`
    INSERT INTO feedback (agent_id, client_address, feedback_index, value, value_decimals, block_number, tx_hash, source, target_address)
    VALUES (${agentId}, ${validAddress}, 0, ${rating}, 0, ${tx.block_number}, ${tx_hash.toLowerCase()}, 'api', ${validAddress})
    RETURNING id
  `

  // Mark wallet for rescoring
  await sql`UPDATE wallets SET needs_rescore = true WHERE address = ${validAddress}`

  return c.json({ success: true, feedback_id: result[0].id })
})

// List wallets (paginated, sortable, filterable by score range)
app.get('/wallets', async (c) => {
  const sql = getSQL(c)
  const limit = Math.min(safeInt(c.req.query('limit'), 50), 100)
  const offset = safeInt(c.req.query('offset'), 0)
  const source = validateSource(c.req.query('source'))
  const sort = c.req.query('sort') === 'score' ? 'trust_score' : 'tx_count'
  const scoreMin = c.req.query('score_min') != null ? safeInt(c.req.query('score_min'), 0) : null
  const scoreMax = c.req.query('score_max') != null ? safeInt(c.req.query('score_max'), 100) : null

  // neon() HTTP driver doesn't handle NULL-coalescing pattern (col = $1 OR $1 IS NULL).
  // Build WHERE clauses and use parameterized queries per combination.
  // Sort uses hardcoded ternary — no user input reaches SQL identifiers.
  let wallets
  let total

  if (source) {
    if (scoreMin !== null && scoreMax !== null) {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} AND trust_score >= ${scoreMin} AND trust_score <= ${scoreMax} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} AND trust_score >= ${scoreMin} AND trust_score <= ${scoreMax} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE source = ${source} AND trust_score >= ${scoreMin} AND trust_score <= ${scoreMax}`
    } else if (scoreMin !== null) {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} AND trust_score >= ${scoreMin} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} AND trust_score >= ${scoreMin} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE source = ${source} AND trust_score >= ${scoreMin}`
    } else if (scoreMax !== null) {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} AND trust_score <= ${scoreMax} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} AND trust_score <= ${scoreMax} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE source = ${source} AND trust_score <= ${scoreMax}`
    } else {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE source = ${source} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE source = ${source}`
    }
  } else {
    if (scoreMin !== null && scoreMax !== null) {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE trust_score >= ${scoreMin} AND trust_score <= ${scoreMax} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE trust_score >= ${scoreMin} AND trust_score <= ${scoreMax} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE trust_score >= ${scoreMin} AND trust_score <= ${scoreMax}`
    } else if (scoreMin !== null) {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE trust_score >= ${scoreMin} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE trust_score >= ${scoreMin} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE trust_score >= ${scoreMin}`
    } else if (scoreMax !== null) {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE trust_score <= ${scoreMax} ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets WHERE trust_score <= ${scoreMax} ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets WHERE trust_score <= ${scoreMax}`
    } else {
      wallets = sort === 'trust_score'
        ? await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at, role FROM wallets ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}`
      total = await sql`SELECT COUNT(*)::int as count FROM wallets`
    }
  }

  return c.json({ wallets, total: total[0].count, limit, offset, sort })
})

// Leaderboard — top wallets by trust score
app.get('/leaderboard', async (c) => {
  const sql = getSQL(c)
  const limit = Math.min(safeInt(c.req.query('limit'), 20), 100)
  const source = validateSource(c.req.query('source'))

  const wallets = source
    ? await sql`
        SELECT address, source, trust_score, score_breakdown, tx_count, first_seen_at, last_seen_at, role
        FROM wallets
        WHERE trust_score IS NOT NULL AND source = ${source}
        ORDER BY trust_score DESC, tx_count DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT address, source, trust_score, score_breakdown, tx_count, first_seen_at, last_seen_at, role
        FROM wallets
        WHERE trust_score IS NOT NULL
        ORDER BY trust_score DESC, tx_count DESC
        LIMIT ${limit}
      `

  return c.json({
    leaderboard: wallets.map((w: any, i: number) => ({
      rank: i + 1,
      ...w,
    })),
  })
})

// Wallet detail
app.get('/wallet/:address', async (c) => {
  const sql = getSQL(c)
  const address = validateAddress(c.req.param('address'))
  if (!address) return c.json({ error: 'Invalid address format. Expected 0x + 40 hex characters.' }, 400)

  const wallet = await sql`SELECT * FROM wallets WHERE address = ${address}`
  if (wallet.length === 0) return c.json({ error: 'Wallet not found' }, 404)

  const txCount = await sql`
    SELECT COUNT(*)::int as count FROM transactions
    WHERE payer = ${address} OR recipient = ${address}
  `
  const feedbackCount = await sql`
    SELECT COUNT(*)::int as count FROM feedback f
    JOIN wallets w ON f.agent_id = w.erc8004_id
    WHERE w.address = ${address}
  `

  return c.json({
    wallet: wallet[0],
    stats: {
      transactions: txCount[0].count,
      feedback: feedbackCount[0].count,
    },
  })
})

// Score history for a wallet
app.get('/wallet/:address/score-history', async (c) => {
  const sql = getSQL(c)
  const address = validateAddress(c.req.param('address'))
  if (!address) return c.json({ error: 'Invalid address format. Expected 0x + 40 hex characters.' }, 400)
  const limit = Math.min(safeInt(c.req.query('limit'), 20), 100)

  const history = await sql`
    SELECT trust_score, score_breakdown, computed_at
    FROM score_history WHERE address = ${address}
    ORDER BY computed_at DESC LIMIT ${limit}
  `

  return c.json({ history })
})

// Trust score for a wallet
app.get('/score/:address', async (c) => {
  const sql = getSQL(c)
  const address = validateAddress(c.req.param('address'))
  if (!address) return c.json({ error: 'Invalid address format. Expected 0x + 40 hex characters.' }, 400)

  const wallet = await sql`
    SELECT address, source, trust_score, score_breakdown, scored_at, tx_count, role
    FROM wallets WHERE address = ${address}
  `
  if (wallet.length === 0) return c.json({ error: 'Wallet not found' }, 404)

  const w = wallet[0]
  if (w.trust_score == null) {
    return c.json({
      address: w.address,
      trust_score: null,
      tier: null,
      percentile: null,
      role: w.role ?? null,
      message: 'Score not yet computed. Run: npm run score',
    })
  }

  const tier =
    w.trust_score >= 80 ? 'HIGH' :
    w.trust_score >= 50 ? 'MEDIUM' :
    w.trust_score >= 20 ? 'LOW' : 'MINIMAL'

  const pctResult = await sql`
    SELECT
      COUNT(*) FILTER (WHERE trust_score <= ${w.trust_score})::float
      / NULLIF(COUNT(*), 0) * 100 AS percentile
    FROM wallets WHERE trust_score IS NOT NULL
  `
  const percentile = pctResult[0].percentile != null ? Math.round(pctResult[0].percentile) : null

  return c.json({
    address: w.address,
    trust_score: w.trust_score,
    tier,
    percentile,
    breakdown: w.score_breakdown,
    scored_at: w.scored_at,
    source: w.source,
    tx_count: w.tx_count,
    role: w.role ?? null,
  })
})

// Wallet transactions
app.get('/wallet/:address/transactions', async (c) => {
  const sql = getSQL(c)
  const address = validateAddress(c.req.param('address'))
  if (!address) return c.json({ error: 'Invalid address format. Expected 0x + 40 hex characters.' }, 400)
  const limit = Math.min(safeInt(c.req.query('limit'), 25), 100)
  const offset = safeInt(c.req.query('offset'), 0)

  const txs = await sql`
    SELECT * FROM transactions
    WHERE payer = ${address} OR recipient = ${address}
    ORDER BY block_number DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  return c.json({ transactions: txs })
})

// Wallet feedback
app.get('/wallet/:address/feedback', async (c) => {
  const sql = getSQL(c)
  const address = validateAddress(c.req.param('address'))
  if (!address) return c.json({ error: 'Invalid address format. Expected 0x + 40 hex characters.' }, 400)
  const limit = Math.min(safeInt(c.req.query('limit'), 25), 100)
  const offset = safeInt(c.req.query('offset'), 0)

  const fb = await sql`
    SELECT f.* FROM feedback f
    JOIN wallets w ON f.agent_id = w.erc8004_id
    WHERE w.address = ${address}
    ORDER BY f.block_number DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  return c.json({ feedback: fb })
})

// Stats (with score distribution)
app.get('/stats', async (c) => {
  const sql = getSQL(c)

  const [walletsBySource, txs, fb, dbSize, idxState, scoreDist] = await Promise.all([
    sql`SELECT source, COUNT(*)::int as count FROM wallets GROUP BY source`,
    sql`SELECT COUNT(*)::int as count FROM transactions`,
    sql`SELECT COUNT(*)::int as count FROM feedback`,
    sql`SELECT pg_database_size(current_database()) as size`,
    sql`SELECT * FROM indexer_state ORDER BY id`,
    sql`
      SELECT
        CASE
          WHEN trust_score >= 80 THEN 'HIGH'
          WHEN trust_score >= 50 THEN 'MEDIUM'
          WHEN trust_score >= 20 THEN 'LOW'
          ELSE 'MINIMAL'
        END as tier,
        COUNT(*)::int as count,
        ROUND(AVG(trust_score))::int as avg_score
      FROM wallets
      WHERE trust_score IS NOT NULL
      GROUP BY tier
    `,
  ])

  return c.json({
    wallets: walletsBySource,
    transactions: txs[0].count,
    feedback: fb[0].count,
    score_distribution: scoreDist,
    db_size_mb: (Number(dbSize[0].size) / 1024 / 1024).toFixed(1),
    db_limit_mb: 500,
    indexer_state: idxState,
  })
})

// Generate API key
app.post('/api-keys', async (c) => {
  const sql = getSQL(c)
  let body: any
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { name } = body
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return c.json({ error: 'name is required (min 2 characters)' }, 400)
  }

  // CF Workers use Web Crypto API
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const key = `ak_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`

  const result = await sql`
    INSERT INTO api_keys (key, name, tier, daily_limit)
    VALUES (${key}, ${name.trim()}, 'free', 1000)
    RETURNING id, key, name, tier, daily_limit, created_at
  `

  return c.json({
    api_key: result[0].key,
    name: result[0].name,
    tier: result[0].tier,
    daily_limit: result[0].daily_limit,
    created_at: result[0].created_at,
    message: 'Store this key securely. It cannot be retrieved again.',
  }, 201)
})

export default app
