import sql from '../src/db/client.js'

const x402Total = await sql`SELECT COUNT(*) as count FROM transactions WHERE is_x402 = true`
const x402Wallets = await sql`SELECT COUNT(DISTINCT authorizer) as count FROM transactions WHERE is_x402 = true`
const x402Recipients = await sql`SELECT COUNT(DISTINCT recipient) as count FROM transactions WHERE is_x402 = true AND recipient IS NOT NULL`
const x402Volume = await sql`SELECT SUM(amount_usdc) as total FROM transactions WHERE is_x402 = true AND amount_usdc IS NOT NULL`
const x402AvgDeal = await sql`SELECT ROUND(AVG(amount_usdc)::numeric, 4) as avg FROM transactions WHERE is_x402 = true AND amount_usdc IS NOT NULL`
const facilitators = await sql`SELECT facilitator, COUNT(*) as count FROM transactions WHERE is_x402 = true AND facilitator IS NOT NULL GROUP BY facilitator ORDER BY count DESC LIMIT 5`
const uniqueFeedbackAgents = await sql`SELECT COUNT(DISTINCT agent_id) as count FROM feedback`
const erc8004Registered = await sql`SELECT COUNT(*) as count FROM wallets WHERE erc8004_id IS NOT NULL`
const totalWallets = await sql`SELECT COUNT(*) as count FROM wallets`

console.log('\n=== x402 Payment Facts ===')
console.log('x402 transactions:', Number(x402Total[0].count).toLocaleString())
console.log('Unique paying agents (authorizers):', Number(x402Wallets[0].count).toLocaleString())
console.log('Unique recipients:', Number(x402Recipients[0].count).toLocaleString())
console.log('Total USDC volume:', x402Volume[0].total ? `$${Number(x402Volume[0].total).toFixed(2)}` : 'N/A')
console.log('Avg deal size:', x402AvgDeal[0].avg ? `$${x402AvgDeal[0].avg} USDC` : 'N/A')
console.log('\nTop facilitators (gas payers):')
facilitators.forEach((r: any) => console.log(`  ${r.facilitator}: ${r.count} txns`))

console.log('\n=== Identity Facts ===')
console.log('Total wallets:', Number(totalWallets[0].count).toLocaleString())
console.log('ERC-8004 confirmed agents:', Number(erc8004Registered[0].count).toLocaleString())
console.log('Agents with on-chain feedback:', Number(uniqueFeedbackAgents[0].count).toLocaleString())

await sql.end()
