/**
 * Quick test of MCP tool logic — calls the same DB queries
 * the MCP server would use, without the stdio transport.
 */

import sql from '../src/db/client.js'

async function main() {
  console.log('=== MCP Tool Logic Test ===\n')

  // Test 1: lookup_wallet — find a known wallet
  const wallets = await sql`SELECT address FROM wallets LIMIT 1`
  if (wallets.length > 0) {
    const addr = wallets[0].address
    const wallet = await sql`SELECT * FROM wallets WHERE address = ${addr}`
    const txCount = await sql`SELECT COUNT(*) as count FROM transactions WHERE payer = ${addr} OR recipient = ${addr}`
    console.log('1. lookup_wallet:', {
      found: true,
      address: wallet[0].address,
      source: wallet[0].source,
      erc8004_id: wallet[0].erc8004_id,
      tx_count: Number(txCount[0].count),
    })
  } else {
    console.log('1. lookup_wallet: No wallets in DB yet')
  }

  // Test 2: lookup_wallet — unknown address
  const unknown = await sql`SELECT * FROM wallets WHERE address = '0x0000000000000000000000000000000000000000'`
  console.log('2. lookup_wallet (unknown):', { found: unknown.length > 0 })

  // Test 3: list_wallets
  const listed = await sql`SELECT address, source, chain FROM wallets ORDER BY last_seen_at DESC NULLS LAST LIMIT 5`
  console.log('3. list_wallets:', listed.length, 'results')

  // Test 4: stats
  const walletCount = await sql`SELECT COUNT(*) as count FROM wallets`
  const txCount = await sql`SELECT COUNT(*) as count FROM transactions`
  const feedbackCount = await sql`SELECT COUNT(*) as count FROM feedback`
  const dbSize = await sql`SELECT pg_database_size(current_database()) as size`
  console.log('4. agentkarma_stats:', {
    wallets: Number(walletCount[0].count),
    transactions: Number(txCount[0].count),
    feedback: Number(feedbackCount[0].count),
    db_mb: (Number(dbSize[0].size) / 1024 / 1024).toFixed(1),
  })

  console.log('\nAll MCP tool queries working!')
  await sql.end()
}

main().catch(console.error)
