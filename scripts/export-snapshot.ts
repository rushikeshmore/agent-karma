import sql from '../src/db/client.js'

const date = process.argv[2] ?? '2026-06-03'
const totals = await sql`SELECT
  (SELECT COUNT(*) FROM wallets)::int as wallets,
  (SELECT COUNT(*) FROM transactions)::int as transactions,
  (SELECT COUNT(*) FROM feedback)::int as feedback`
const dist = await sql`
  SELECT CASE WHEN trust_score>=80 THEN 'HIGH' WHEN trust_score>=50 THEN 'MEDIUM'
    WHEN trust_score>=20 THEN 'LOW' ELSE 'MINIMAL' END as tier,
  COUNT(*)::int as count, ROUND(AVG(trust_score))::int as avg_score
  FROM wallets WHERE trust_score IS NOT NULL
  GROUP BY 1 ORDER BY MIN(trust_score) DESC`
const top = await sql`
  SELECT address, trust_score, source, chain, COALESCE(tx_count,0)::int as tx_count
  FROM wallets WHERE trust_score IS NOT NULL
  ORDER BY trust_score DESC, tx_count DESC NULLS LAST LIMIT 100`
const state = await sql`SELECT id, last_block::text FROM indexer_state ORDER BY id`
const snapshot = {
  project: 'AgentKarma',
  status: 'archived',
  snapshotDate: date,
  note: 'Final frozen snapshot. Indexing stopped; hosted API and database retired. Numbers do not update.',
  totals: totals[0],
  distribution: dist,
  indexedTo: Object.fromEntries(state.map((r:any)=>[r.id, r.last_block])),
  topWallets: top,
}
console.log(JSON.stringify(snapshot, null, 2))
await sql.end()
