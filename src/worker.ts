/**
 * AgentKarma API — Cloudflare Workers entry point.
 *
 * Uses @neondatabase/serverless (HTTP mode) instead of postgres.js
 * since Workers don't support raw TCP sockets.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { neon } from '@neondatabase/serverless'

type Bindings = {
  DATABASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// Helper: create a per-request SQL function
function getSQL(c: { env: Bindings }) {
  return neon(c.env.DATABASE_URL)
}

// Health check
app.get('/', (c) =>
  c.json({
    name: 'AgentKarma',
    version: '0.2.0',
    description: 'Credit bureau for AI agent wallets',
    runtime: 'cloudflare-workers',
  })
)

// List wallets (paginated, sortable)
app.get('/wallets', async (c) => {
  const sql = getSQL(c)
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const offset = Number(c.req.query('offset') ?? 0)
  const source = c.req.query('source')
  const sort = c.req.query('sort') === 'score' ? 'trust_score' : 'tx_count'

  // neon() doesn't support sql() identifier helper, use conditional queries
  const wallets = source
    ? sort === 'trust_score'
      ? await sql`
          SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at
          FROM wallets WHERE source = ${source}
          ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at
          FROM wallets WHERE source = ${source}
          ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}
        `
    : sort === 'trust_score'
      ? await sql`
          SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at
          FROM wallets
          ORDER BY trust_score DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}
        `
      : await sql`
          SELECT address, source, chain, erc8004_id, tx_count, trust_score, score_breakdown, scored_at, first_seen_at, last_seen_at
          FROM wallets
          ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}
        `

  const total = await sql`SELECT COUNT(*)::int as count FROM wallets`

  return c.json({ wallets, total: total[0].count, limit, offset, sort })
})

// Leaderboard — top wallets by trust score
app.get('/leaderboard', async (c) => {
  const sql = getSQL(c)
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100)
  const source = c.req.query('source')

  const wallets = source
    ? await sql`
        SELECT address, source, trust_score, score_breakdown, tx_count, first_seen_at, last_seen_at
        FROM wallets
        WHERE trust_score IS NOT NULL AND source = ${source}
        ORDER BY trust_score DESC, tx_count DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT address, source, trust_score, score_breakdown, tx_count, first_seen_at, last_seen_at
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
  const address = c.req.param('address').toLowerCase()

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

// Trust score for a wallet
app.get('/score/:address', async (c) => {
  const sql = getSQL(c)
  const address = c.req.param('address').toLowerCase()

  const wallet = await sql`
    SELECT address, source, trust_score, score_breakdown, scored_at, tx_count
    FROM wallets WHERE address = ${address}
  `
  if (wallet.length === 0) return c.json({ error: 'Wallet not found' }, 404)

  const w = wallet[0]
  if (w.trust_score === null) {
    return c.json({
      address: w.address,
      score: null,
      message: 'Score not yet computed',
    })
  }

  const tier =
    w.trust_score >= 80 ? 'HIGH' :
    w.trust_score >= 50 ? 'MEDIUM' :
    w.trust_score >= 20 ? 'LOW' : 'MINIMAL'

  return c.json({
    address: w.address,
    trust_score: w.trust_score,
    tier,
    breakdown: w.score_breakdown,
    scored_at: w.scored_at,
    source: w.source,
    tx_count: w.tx_count,
  })
})

// Wallet transactions
app.get('/wallet/:address/transactions', async (c) => {
  const sql = getSQL(c)
  const address = c.req.param('address').toLowerCase()
  const limit = Math.min(Number(c.req.query('limit') ?? 25), 100)
  const offset = Number(c.req.query('offset') ?? 0)

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
  const address = c.req.param('address').toLowerCase()

  const fb = await sql`
    SELECT f.* FROM feedback f
    JOIN wallets w ON f.agent_id = w.erc8004_id
    WHERE w.address = ${address}
    ORDER BY f.block_number DESC
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
          WHEN trust_score >= 80 THEN 'high'
          WHEN trust_score >= 50 THEN 'medium'
          WHEN trust_score >= 20 THEN 'low'
          ELSE 'minimal'
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

export default app
