import { Hono } from 'hono'
import { cors } from 'hono/cors'
import sql from '../db/client.js'

const app = new Hono()

app.use('*', cors())

// Health check
app.get('/', (c) =>
  c.json({
    name: 'AgentKarma',
    version: '0.1.0',
    description: 'Credit bureau for AI agent wallets',
  })
)

// List wallets (paginated)
app.get('/wallets', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
  const offset = Number(c.req.query('offset') ?? 0)
  const source = c.req.query('source')

  const wallets = source
    ? await sql`
        SELECT * FROM wallets WHERE source = ${source}
        ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT * FROM wallets
        ORDER BY tx_count DESC LIMIT ${limit} OFFSET ${offset}
      `

  const total = await sql`SELECT COUNT(*)::int as count FROM wallets`

  return c.json({ wallets, total: total[0].count, limit, offset })
})

// Wallet detail
app.get('/wallet/:address', async (c) => {
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

// Wallet transactions
app.get('/wallet/:address/transactions', async (c) => {
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
  const address = c.req.param('address').toLowerCase()

  const fb = await sql`
    SELECT f.* FROM feedback f
    JOIN wallets w ON f.agent_id = w.erc8004_id
    WHERE w.address = ${address}
    ORDER BY f.block_number DESC
  `

  return c.json({ feedback: fb })
})

// Stats
app.get('/stats', async (c) => {
  const [walletsBySource, txs, fb, dbSize, idxState] = await Promise.all([
    sql`SELECT source, COUNT(*)::int as count FROM wallets GROUP BY source`,
    sql`SELECT COUNT(*)::int as count FROM transactions`,
    sql`SELECT COUNT(*)::int as count FROM feedback`,
    sql`SELECT pg_database_size(current_database()) as size`,
    sql`SELECT * FROM indexer_state ORDER BY id`,
  ])

  return c.json({
    wallets: walletsBySource,
    transactions: txs[0].count,
    feedback: fb[0].count,
    db_size_mb: (Number(dbSize[0].size) / 1024 / 1024).toFixed(1),
    db_limit_mb: 500,
    indexer_state: idxState,
  })
})

export default app
