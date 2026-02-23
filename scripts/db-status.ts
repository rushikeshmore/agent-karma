import sql from '../src/db/client.js'

async function main() {
  const wallets = await sql`SELECT COUNT(*) as count FROM wallets`
  const txns = await sql`SELECT COUNT(*) as count FROM transactions`
  const feedback = await sql`SELECT COUNT(*) as count FROM feedback`
  const state = await sql`SELECT * FROM indexer_state`
  const dbSize = await sql`SELECT pg_database_size(current_database()) as size`

  console.log('Wallets:', wallets[0].count)
  console.log('Transactions:', txns[0].count)
  console.log('Feedback:', feedback[0].count)
  console.log('Indexer state:', JSON.stringify(state, null, 2))
  console.log('DB size:', (Number(dbSize[0].size) / 1024 / 1024).toFixed(1), 'MB / 500 MB')
  await sql.end()
}

main().catch(console.error)
