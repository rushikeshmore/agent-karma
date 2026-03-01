/**
 * x402 Indexer — indexes AuthorizationUsed events on USDC (multi-chain).
 *
 * Detects x402 payments by matching AuthorizationUsed (EIP-3009)
 * with Transfer events in the same transaction receipt.
 *
 * CLI script: run → scan → write to DB → exit.
 * Resumable via indexer_state table.
 *
 * Usage:
 *   npm run indexer:x402                       (Base only, default)
 *   npm run indexer:x402 -- --chain base       (Base only)
 *   npm run indexer:x402 -- --chain arbitrum   (Arbitrum only)
 *   npm run indexer:x402 -- --chain all        (all supported chains)
 *   npm run indexer:x402 -- --days 7           (backfill N days)
 *   npm run indexer:x402 -- --limit 1000       (max blocks to scan)
 */

import { parseAbiItem, formatUnits, type PublicClient } from 'viem'
import { baseClient, arbClient } from '../config/chains.js'
import {
  BASE_USDC,
  ARB_USDC,
  KNOWN_FACILITATORS,
  TRANSFER_TOPIC,
  BATCH_SIZE,
  BATCH_DELAY_BASE_MS,
  BATCH_DELAY_ARB_MS,
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
const chainArg = getArg('chain') // 'base', 'arbitrum', 'all', or undefined (= base)

interface X402ChainConfig {
  client: PublicClient
  chain: string
  usdcAddress: `0x${string}`
  stateId: string
  batchDelay: number
  blocksPerDay: bigint
  label: string
}

const BASE_BLOCKS_PER_DAY = 43200n // ~2s per block on Base
const ARB_BLOCKS_PER_DAY = 345600n // ~0.25s per block on Arbitrum

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status ?? err?.cause?.status
      const isRetryable = status === 429 || status === 502 || status === 503 ||
        err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'UND_ERR_SOCKET'
      if (isRetryable && attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt - 1)
        console.log(`  [${label}] Retryable error (attempt ${attempt}/${maxRetries}), waiting ${delay}ms...`)
        await sleep(delay)
      } else {
        throw err
      }
    }
  }
  throw new Error('unreachable')
}

async function indexX402(fromBlock: bigint, toBlock: bigint, cfg: X402ChainConfig): Promise<{ txns: number; wallets: number }> {
  let totalTxns = 0
  let newWallets = 0
  let current = fromBlock
  const totalBlocks = toBlock - fromBlock + 1n
  let blocksScanned = 0n

  while (current <= toBlock) {
    if (shouldStop()) {
      console.log(`[x402/${cfg.label}] CU budget limit reached — stopping safely. Will resume next run.`)
      break
    }

    const batchEnd = current + BATCH_SIZE - 1n > toBlock ? toBlock : current + BATCH_SIZE - 1n

    // Get AuthorizationUsed events in this block range
    trackCU('eth_getLogs')
    const authLogs = await withRetry(() => cfg.client.getLogs({
      address: cfg.usdcAddress,
      event: parseAbiItem(
        'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)'
      ),
      fromBlock: current,
      toBlock: batchEnd,
    }), `x402/${cfg.label}`)

    if (authLogs.length > 0) {
      // Group by txHash to avoid duplicate receipt fetches
      const txHashes = [...new Set(authLogs.map((l) => l.transactionHash))]

      for (const txHash of txHashes) {
        trackCU('eth_getTransactionReceipt')
        const receipt = await withRetry(() => cfg.client.getTransactionReceipt({ hash: txHash }), `x402/${cfg.label}`)

        trackCU('eth_getTransaction')
        const tx = await withRetry(() => cfg.client.getTransaction({ hash: txHash }), `x402/${cfg.label}`)

        const isFacilitator = KNOWN_FACILITATORS.has(tx.from.toLowerCase())

        // Find USDC Transfer events in same receipt
        const transfers = receipt.logs.filter(
          (log) =>
            log.address.toLowerCase() === cfg.usdcAddress.toLowerCase() &&
            log.topics[0] === TRANSFER_TOPIC
        )

        for (const t of transfers) {
          try {
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
                ${txHash}, ${Number(receipt.blockNumber)}, ${cfg.chain},
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
                VALUES (${addr}, 'x402', ${cfg.chain}, ${Number(receipt.blockNumber)}, NOW(), NOW(), 1)
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
          } catch (err: any) {
            console.error(`  [x402/${cfg.label}] Insert failed for tx ${txHash}, skipping: ${err.message}`)
          }
        }

        await sleep(RECEIPT_DELAY_MS)
      }
    }

    blocksScanned += batchEnd - current + 1n

    // Update indexer state (with retry — Neon may ECONNRESET)
    try {
      await sql`
        INSERT INTO indexer_state (id, last_block, updated_at)
        VALUES (${cfg.stateId}, ${Number(batchEnd)}, NOW())
        ON CONFLICT (id) DO UPDATE SET last_block = ${Number(batchEnd)}, updated_at = NOW()
      `
    } catch (err: any) {
      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        console.log(`  [x402/${cfg.label}] DB connection lost at block ${batchEnd}, will resume from last saved state.`)
        await sleep(3000)
        try {
          await sql`
            INSERT INTO indexer_state (id, last_block, updated_at)
            VALUES (${cfg.stateId}, ${Number(batchEnd)}, NOW())
            ON CONFLICT (id) DO UPDATE SET last_block = ${Number(batchEnd)}, updated_at = NOW()
          `
        } catch {
          console.log(`  [x402/${cfg.label}] State save retry failed. Progress up to block ${batchEnd} may need re-scan.`)
        }
      } else {
        throw err
      }
    }

    // Progress log
    if (blocksScanned % (BATCH_SIZE * 50n) === 0n || authLogs.length > 0) {
      const pct = ((Number(blocksScanned) / Number(totalBlocks)) * 100).toFixed(1)
      console.log(
        `  [x402/${cfg.label}] ${pct}% | block ${current}–${batchEnd} | ${authLogs.length} auth events | ${totalTxns} total txns | CU: ${getCUUsage().totalCUs}`
      )
    }

    current = batchEnd + 1n
    await sleep(cfg.batchDelay)
  }

  return { txns: totalTxns, wallets: newWallets }
}

// ============================
// Main
// ============================

const X402_CHAINS: X402ChainConfig[] = [
  {
    client: baseClient as PublicClient,
    chain: 'base',
    usdcAddress: BASE_USDC,
    stateId: 'x402_base',
    batchDelay: BATCH_DELAY_BASE_MS,
    blocksPerDay: BASE_BLOCKS_PER_DAY,
    label: 'base',
  },
  {
    client: arbClient as PublicClient,
    chain: 'arbitrum',
    usdcAddress: ARB_USDC,
    stateId: 'x402_arb',
    batchDelay: BATCH_DELAY_ARB_MS,
    blocksPerDay: ARB_BLOCKS_PER_DAY,
    label: 'arb',
  },
]

async function indexChain(cfg: X402ChainConfig): Promise<{ txns: number; wallets: number }> {
  console.log(`\n--- x402 ${cfg.label} ---`)

  trackCU('eth_blockNumber')
  const currentBlock = await cfg.client.getBlockNumber()
  console.log(`Current ${cfg.label} block: ${currentBlock}`)

  const state = await sql`SELECT last_block FROM indexer_state WHERE id = ${cfg.stateId}`
  const defaultStart = currentBlock - (cfg.blocksPerDay * BigInt(daysBack))

  let fromBlock = state.length > 0 ? BigInt(state[0].last_block) + 1n : defaultStart
  let toBlock = currentBlock

  if (blockLimit && fromBlock + blockLimit < toBlock) {
    toBlock = fromBlock + blockLimit
  }

  if (fromBlock > currentBlock) {
    console.log(`  ${cfg.label}: Already up to date.`)
    return { txns: 0, wallets: 0 }
  }

  const totalBlocks = toBlock - fromBlock + 1n
  const totalBatches = Math.ceil(Number(totalBlocks) / Number(BATCH_SIZE))
  const estimatedCUs = totalBatches * 75 + totalBatches * 2 * 28

  console.log(`Scanning blocks ${fromBlock}–${toBlock} (${totalBlocks} blocks, ~${totalBatches} batches)`)
  console.log(`Estimated CU cost: ~${estimatedCUs.toLocaleString()} CUs (${((estimatedCUs / 30_000_000) * 100).toFixed(2)}% of monthly budget)`)
  console.log(`Days back: ${daysBack}\n`)

  return indexX402(fromBlock, toBlock, cfg)
}

async function main() {
  console.log('\n=== x402 Indexer (Multi-chain) ===\n')

  const startTime = Date.now()
  let totalTxns = 0
  let totalWallets = 0

  // Determine which chains to index
  const chainsToIndex = chainArg === 'all'
    ? X402_CHAINS
    : X402_CHAINS.filter((c) => chainArg ? c.chain === chainArg : c.chain === 'base')

  for (const cfg of chainsToIndex) {
    const result = await indexChain(cfg)
    totalTxns += result.txns
    totalWallets += result.wallets
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Summary
  const walletCount = await sql`SELECT COUNT(*) as count FROM wallets`
  const txCount = await sql`SELECT COUNT(*) as count FROM transactions`
  const dbSize = await sql`SELECT pg_database_size(current_database()) as size`
  const sizeMB = (Number(dbSize[0].size) / 1024 / 1024).toFixed(1)

  console.log('\n=== Summary ===')
  console.log(`Time: ${elapsed}s`)
  console.log(`New transactions: ${totalTxns}`)
  console.log(`New wallets discovered: ${totalWallets}`)
  console.log(`Total wallets in DB: ${walletCount[0].count}`)
  console.log(`Total transactions in DB: ${txCount[0].count}`)
  console.log(`DB size: ${sizeMB} MB / 500 MB`)
  console.log('CU usage:', getCUUsage())

  await sql.end()
}

async function mainWithRetry(maxRestarts = 5) {
  for (let attempt = 1; attempt <= maxRestarts; attempt++) {
    try {
      await main()
      return // Clean exit
    } catch (err: any) {
      const isRetryable = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED'
      if (isRetryable && attempt < maxRestarts) {
        const delay = 5000 * attempt
        console.log(`\n[x402] Connection lost (${err.code}), restarting in ${delay / 1000}s... (attempt ${attempt}/${maxRestarts})`)
        await sleep(delay)
      } else {
        console.error('Indexer failed:', err)
        await sql.end()
        process.exit(1)
      }
    }
  }
}

mainWithRetry().catch(async (err) => {
  console.error('Indexer failed:', err)
  await sql.end()
  process.exit(1)
})
