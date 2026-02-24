/**
 * x402 Indexer — indexes AuthorizationUsed events on Base USDC.
 *
 * Detects x402 payments by matching AuthorizationUsed (EIP-3009)
 * with Transfer events in the same transaction receipt.
 *
 * CLI script: run → scan → write to DB → exit.
 * Resumable via indexer_state table.
 *
 * Usage:
 *   npm run indexer:x402
 *   npm run indexer:x402 -- --days 7      (backfill N days)
 *   npm run indexer:x402 -- --limit 1000  (max blocks to scan)
 */

import { parseAbiItem, formatUnits } from 'viem'
import { baseClient } from '../config/chains.js'
import {
  BASE_USDC,
  KNOWN_FACILITATORS,
  TRANSFER_TOPIC,
  BATCH_SIZE,
  BATCH_DELAY_BASE_MS,
  RECEIPT_DELAY_MS,
} from '../config/constants.js'
import { trackCU, getCUUsage, shouldStop } from './cu-tracker.js'
import sql from '../db/client.js'

// Parse CLI flags
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}
const daysBack = getArg('days') ? Number(getArg('days')) : 7
const blockLimit = getArg('limit') ? BigInt(getArg('limit')!) : undefined

const BASE_BLOCKS_PER_DAY = 43200n // ~2s per block on Base

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function indexX402(fromBlock: bigint, toBlock: bigint): Promise<{ txns: number; wallets: number }> {
  let totalTxns = 0
  let newWallets = 0
  let current = fromBlock
  const totalBlocks = toBlock - fromBlock + 1n
  let blocksScanned = 0n

  while (current <= toBlock) {
    if (shouldStop()) {
      console.log('[x402] CU budget limit reached — stopping safely. Will resume next run.')
      break
    }

    const batchEnd = current + BATCH_SIZE - 1n > toBlock ? toBlock : current + BATCH_SIZE - 1n

    // Get AuthorizationUsed events in this block range
    trackCU('eth_getLogs')
    const authLogs = await baseClient.getLogs({
      address: BASE_USDC,
      event: parseAbiItem(
        'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)'
      ),
      fromBlock: current,
      toBlock: batchEnd,
    })

    if (authLogs.length > 0) {
      // Group by txHash to avoid duplicate receipt fetches
      const txHashes = [...new Set(authLogs.map((l) => l.transactionHash))]

      for (const txHash of txHashes) {
        trackCU('eth_getTransactionReceipt')
        const receipt = await baseClient.getTransactionReceipt({ hash: txHash })

        trackCU('eth_getTransaction')
        const tx = await baseClient.getTransaction({ hash: txHash })

        const isFacilitator = KNOWN_FACILITATORS.has(tx.from.toLowerCase())

        // Find USDC Transfer events in same receipt
        const transfers = receipt.logs.filter(
          (log) =>
            log.address.toLowerCase() === BASE_USDC.toLowerCase() &&
            log.topics[0] === TRANSFER_TOPIC
        )

        for (const t of transfers) {
          const payer = ('0x' + t.topics[1]!.slice(26)).toLowerCase()
          const recipient = ('0x' + t.topics[2]!.slice(26)).toLowerCase()
          const amountRaw = BigInt(t.data)
          const amountUSDC = Number(formatUnits(amountRaw, 6))

          // Get the authorizer for this tx
          const authLog = authLogs.find((a) => a.transactionHash === txHash)

          // Insert transaction
          await sql`
            INSERT INTO transactions (
              tx_hash, block_number, chain, authorizer, payer, recipient,
              amount_raw, amount_usdc, facilitator, is_x402
            )
            VALUES (
              ${txHash}, ${Number(receipt.blockNumber)}, 'base',
              ${authLog?.args.authorizer?.toLowerCase() ?? payer},
              ${payer}, ${recipient},
              ${amountRaw.toString()}, ${amountUSDC},
              ${tx.from.toLowerCase()}, ${isFacilitator}
            )
            ON CONFLICT (tx_hash, chain) DO NOTHING
          `

          // Upsert wallets for both parties
          for (const addr of [payer, recipient]) {
            const result = await sql`
              INSERT INTO wallets (address, source, chain, first_seen_block, first_seen_at, last_seen_at, tx_count)
              VALUES (${addr}, 'x402', 'base', ${Number(receipt.blockNumber)}, NOW(), NOW(), 1)
              ON CONFLICT (address) DO UPDATE SET
                source = CASE WHEN wallets.source = 'erc8004' THEN 'both' ELSE wallets.source END,
                last_seen_at = NOW(),
                tx_count = wallets.tx_count + 1,
                needs_rescore = true
              RETURNING (xmax = 0) as is_new
            `
            if (result[0]?.is_new) newWallets++
          }

          totalTxns++
        }

        await sleep(RECEIPT_DELAY_MS)
      }
    }

    blocksScanned += batchEnd - current + 1n

    // Update indexer state
    await sql`
      INSERT INTO indexer_state (id, last_block, updated_at)
      VALUES ('x402_base', ${Number(batchEnd)}, NOW())
      ON CONFLICT (id) DO UPDATE SET last_block = ${Number(batchEnd)}, updated_at = NOW()
    `

    // Progress log
    if (blocksScanned % (BATCH_SIZE * 50n) === 0n || authLogs.length > 0) {
      const pct = ((Number(blocksScanned) / Number(totalBlocks)) * 100).toFixed(1)
      console.log(
        `  [x402] ${pct}% | block ${current}–${batchEnd} | ${authLogs.length} auth events | ${totalTxns} total txns | CU: ${getCUUsage().totalCUs}`
      )
    }

    current = batchEnd + 1n
    await sleep(BATCH_DELAY_BASE_MS)
  }

  return { txns: totalTxns, wallets: newWallets }
}

// ============================
// Main
// ============================

async function main() {
  console.log('\n=== x402 Indexer (Base) ===\n')

  trackCU('eth_blockNumber')
  const currentBlock = await baseClient.getBlockNumber()
  console.log(`Current Base block: ${currentBlock}`)

  // Get last indexed block or calculate from days back
  const state = await sql`SELECT last_block FROM indexer_state WHERE id = 'x402_base'`
  const defaultStart = currentBlock - (BASE_BLOCKS_PER_DAY * BigInt(daysBack))

  let fromBlock = state.length > 0 ? BigInt(state[0].last_block) + 1n : defaultStart
  let toBlock = currentBlock

  // Apply block limit if specified
  if (blockLimit && fromBlock + blockLimit < toBlock) {
    toBlock = fromBlock + blockLimit
  }

  if (fromBlock > currentBlock) {
    console.log('Already up to date. Nothing to index.')
    await sql.end()
    return
  }

  const totalBlocks = toBlock - fromBlock + 1n
  const totalBatches = Math.ceil(Number(totalBlocks) / Number(BATCH_SIZE))
  // Estimate: getLogs per batch (75 CU) + ~2 receipts+txns per batch on average (28 CU each)
  const estimatedCUs = totalBatches * 75 + totalBatches * 2 * 28

  console.log(`Scanning blocks ${fromBlock}–${toBlock} (${totalBlocks} blocks, ~${totalBatches} batches)`)
  console.log(`Estimated CU cost: ~${estimatedCUs.toLocaleString()} CUs (${((estimatedCUs / 30_000_000) * 100).toFixed(2)}% of monthly budget)`)
  console.log(`Days back: ${daysBack}\n`)

  const startTime = Date.now()
  const result = await indexX402(fromBlock, toBlock)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Summary
  const walletCount = await sql`SELECT COUNT(*) as count FROM wallets`
  const txCount = await sql`SELECT COUNT(*) as count FROM transactions`
  const dbSize = await sql`SELECT pg_database_size(current_database()) as size`
  const sizeMB = (Number(dbSize[0].size) / 1024 / 1024).toFixed(1)

  console.log('\n=== Summary ===')
  console.log(`Time: ${elapsed}s`)
  console.log(`New transactions: ${result.txns}`)
  console.log(`New wallets discovered: ${result.wallets}`)
  console.log(`Total wallets in DB: ${walletCount[0].count}`)
  console.log(`Total transactions in DB: ${txCount[0].count}`)
  console.log(`DB size: ${sizeMB} MB / 500 MB`)
  console.log('CU usage:', getCUUsage())

  await sql.end()
}

main().catch(async (err) => {
  console.error('Indexer failed:', err)
  await sql.end()
  process.exit(1)
})
