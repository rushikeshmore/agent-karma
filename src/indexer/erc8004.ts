/**
 * ERC-8004 Indexer — indexes IdentityRegistry mints + ReputationRegistry feedback.
 *
 * Multi-chain: scans both Ethereum and Base (same contract addresses).
 * CLI script: run → scan → write to DB → exit.
 * Resumable via indexer_state table.
 *
 * Usage:
 *   npm run indexer:erc8004                          (both chains)
 *   npm run indexer:erc8004 -- --chain ethereum      (Ethereum only)
 *   npm run indexer:erc8004 -- --chain base          (Base only)
 *   npm run indexer:erc8004 -- --limit 1000          (max blocks to scan)
 */

import { parseAbiItem, type PublicClient } from 'viem'
import { ethClient, baseClient } from '../config/chains.js'
import {
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  IDENTITY_DEPLOY_BLOCK,
  REPUTATION_DEPLOY_BLOCK,
  BASE_IDENTITY_DEPLOY_BLOCK,
  BASE_REPUTATION_DEPLOY_BLOCK,
  BATCH_SIZE,
  BATCH_DELAY_MS,
  BATCH_DELAY_BASE_MS,
} from '../config/constants.js'
import { trackCU, getCUUsage, shouldStop } from './cu-tracker.js'
import sql from '../db/client.js'

// Parse CLI flags
const args = process.argv.slice(2)
function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : undefined
}
const blockLimit = getFlag('limit') ? BigInt(getFlag('limit')!) : undefined

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ============================
// Identity Indexer (mint events)
// ============================

interface ChainConfig {
  client: PublicClient
  chain: string
  stateId: string
  batchDelay: number
  label: string
}

async function indexMints(fromBlock: bigint, toBlock: bigint, cfg: ChainConfig): Promise<number> {
  let totalFound = 0
  let current = fromBlock
  const totalBlocks = toBlock - fromBlock + 1n
  let blocksScanned = 0n

  while (current <= toBlock) {
    if (shouldStop()) {
      console.log(`[mints/${cfg.label}] CU budget limit reached — stopping safely. Will resume next run.`)
      break
    }

    const batchEnd = current + BATCH_SIZE - 1n > toBlock ? toBlock : current + BATCH_SIZE - 1n

    trackCU('eth_getLogs')
    const logs = await cfg.client.getLogs({
      address: IDENTITY_REGISTRY,
      event: parseAbiItem(
        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
      ),
      args: { from: '0x0000000000000000000000000000000000000000' as `0x${string}` },
      fromBlock: current,
      toBlock: batchEnd,
    })

    if (logs.length > 0) {
      // Deduplicate by address — same wallet can mint multiple agent NFTs in one batch
      const seen = new Map<string, { address: string; source: string; chain: string; erc8004_id: number; first_seen_block: number }>()
      for (const log of logs) {
        const addr = log.args.to!.toLowerCase()
        if (!seen.has(addr)) {
          seen.set(addr, {
            address: addr,
            source: 'erc8004',
            chain: cfg.chain,
            erc8004_id: Number(log.args.tokenId!),
            first_seen_block: Number(log.blockNumber),
          })
        }
      }
      const rows = [...seen.values()]

      await sql`
        INSERT INTO wallets ${sql(rows, 'address', 'source', 'chain', 'erc8004_id', 'first_seen_block')}
        ON CONFLICT (address) DO UPDATE SET
          source = CASE WHEN wallets.source = 'x402' THEN 'both' ELSE wallets.source END,
          erc8004_id = COALESCE(wallets.erc8004_id, EXCLUDED.erc8004_id),
          last_seen_at = NOW(),
          needs_rescore = true
      `
    }

    totalFound += logs.length
    blocksScanned += batchEnd - current + 1n

    // Update indexer state
    await sql`
      INSERT INTO indexer_state (id, last_block, updated_at)
      VALUES (${cfg.stateId}, ${Number(batchEnd)}, NOW())
      ON CONFLICT (id) DO UPDATE SET last_block = ${Number(batchEnd)}, updated_at = NOW()
    `

    // Progress log every 100 batches
    if (blocksScanned % (BATCH_SIZE * 100n) === 0n || logs.length > 0) {
      const pct = ((Number(blocksScanned) / Number(totalBlocks)) * 100).toFixed(1)
      console.log(
        `  [mints/${cfg.label}] ${pct}% | block ${current}–${batchEnd} | ${logs.length} found (total: ${totalFound}) | CU: ${getCUUsage().totalCUs}`
      )
    }

    current = batchEnd + 1n
    await sleep(cfg.batchDelay)
  }

  return totalFound
}

// ============================
// Reputation Indexer (feedback events)
// ============================

async function indexFeedback(fromBlock: bigint, toBlock: bigint, cfg: ChainConfig): Promise<number> {
  let totalFound = 0
  let current = fromBlock
  const totalBlocks = toBlock - fromBlock + 1n
  let blocksScanned = 0n

  while (current <= toBlock) {
    if (shouldStop()) {
      console.log(`[feedback/${cfg.label}] CU budget limit reached — stopping safely. Will resume next run.`)
      break
    }

    const batchEnd = current + BATCH_SIZE - 1n > toBlock ? toBlock : current + BATCH_SIZE - 1n

    trackCU('eth_getLogs')
    const logs = await cfg.client.getLogs({
      address: REPUTATION_REGISTRY,
      event: parseAbiItem(
        'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
      ),
      fromBlock: current,
      toBlock: batchEnd,
    })

    if (logs.length > 0) {
      const rows = logs.map((log) => ({
        agent_id: Number(log.args.agentId!),
        client_address: log.args.clientAddress!.toLowerCase(),
        feedback_index: Number(log.args.feedbackIndex!),
        value: log.args.value!.toString(),
        value_decimals: Number(log.args.valueDecimals!),
        tag1: log.args.tag1 ?? null,
        tag2: log.args.tag2 ?? null,
        endpoint: log.args.endpoint ?? null,
        feedback_uri: log.args.feedbackURI ?? null,
        feedback_hash: log.args.feedbackHash ?? null,
        block_number: Number(log.blockNumber),
        tx_hash: log.transactionHash,
      }))

      await sql`
        INSERT INTO feedback ${sql(rows,
          'agent_id', 'client_address', 'feedback_index', 'value', 'value_decimals',
          'tag1', 'tag2', 'endpoint', 'feedback_uri', 'feedback_hash',
          'block_number', 'tx_hash'
        )}
        ON CONFLICT (tx_hash, feedback_index) DO NOTHING
      `
    }

    totalFound += logs.length
    blocksScanned += batchEnd - current + 1n

    await sql`
      INSERT INTO indexer_state (id, last_block, updated_at)
      VALUES (${cfg.stateId}, ${Number(batchEnd)}, NOW())
      ON CONFLICT (id) DO UPDATE SET last_block = ${Number(batchEnd)}, updated_at = NOW()
    `

    if (blocksScanned % (BATCH_SIZE * 100n) === 0n || logs.length > 0) {
      const pct = ((Number(blocksScanned) / Number(totalBlocks)) * 100).toFixed(1)
      console.log(
        `  [feedback/${cfg.label}] ${pct}% | block ${current}–${batchEnd} | ${logs.length} found (total: ${totalFound}) | CU: ${getCUUsage().totalCUs}`
      )
    }

    current = batchEnd + 1n
    await sleep(cfg.batchDelay)
  }

  return totalFound
}

// ============================
// Main
// ============================

// Parse --chain flag (default: both)
const chainArg = getFlag('chain') // 'ethereum', 'base', or undefined (= both)

const ETH_CONFIG: ChainConfig = {
  client: ethClient as PublicClient,
  chain: 'ethereum',
  stateId: '', // set per-indexer below
  batchDelay: BATCH_DELAY_MS,
  label: 'eth',
}

const BASE_CONFIG: ChainConfig = {
  client: baseClient as PublicClient,
  chain: 'base',
  stateId: '', // set per-indexer below
  batchDelay: BATCH_DELAY_BASE_MS,
  label: 'base',
}

async function indexChain(cfg: ChainConfig, identityDeployBlock: bigint, reputationDeployBlock: bigint) {
  trackCU('eth_blockNumber')
  const currentBlock = await cfg.client.getBlockNumber()
  console.log(`Current ${cfg.label} block: ${currentBlock}`)

  const identityStateId = cfg.chain === 'ethereum' ? 'erc8004_identity' : 'erc8004_identity_base'
  const reputationStateId = cfg.chain === 'ethereum' ? 'erc8004_reputation' : 'erc8004_reputation_base'

  const identityState = await sql`SELECT last_block FROM indexer_state WHERE id = ${identityStateId}`
  const reputationState = await sql`SELECT last_block FROM indexer_state WHERE id = ${reputationStateId}`

  const identityFrom = identityState.length > 0 ? BigInt(identityState[0].last_block) + 1n : identityDeployBlock
  const reputationFrom = reputationState.length > 0 ? BigInt(reputationState[0].last_block) + 1n : reputationDeployBlock

  const identityTo = blockLimit ? (identityFrom + blockLimit < currentBlock ? identityFrom + blockLimit : currentBlock) : currentBlock
  const reputationTo = blockLimit ? (reputationFrom + blockLimit < currentBlock ? reputationFrom + blockLimit : currentBlock) : currentBlock

  if (identityFrom > currentBlock && reputationFrom > currentBlock) {
    console.log(`  ${cfg.label}: Already up to date.`)
    return { mints: 0, feedback: 0 }
  }

  const identityBlocks = identityTo >= identityFrom ? identityTo - identityFrom + 1n : 0n
  const reputationBlocks = reputationTo >= reputationFrom ? reputationTo - reputationFrom + 1n : 0n
  const totalBatches = Number(identityBlocks + reputationBlocks) / Number(BATCH_SIZE)
  const estimatedCUs = Math.ceil(totalBatches) * 75

  console.log(`  Identity: blocks ${identityFrom}–${identityTo} (${identityBlocks} blocks, ~${Math.ceil(Number(identityBlocks) / Number(BATCH_SIZE))} batches)`)
  console.log(`  Reputation: blocks ${reputationFrom}–${reputationTo} (${reputationBlocks} blocks, ~${Math.ceil(Number(reputationBlocks) / Number(BATCH_SIZE))} batches)`)
  console.log(`  Estimated CU cost: ~${estimatedCUs.toLocaleString()} CUs`)

  console.log(`\n--- [${cfg.label}] Indexing mints ---`)
  const mintCfg = { ...cfg, stateId: identityStateId }
  const mints = identityFrom <= identityTo ? await indexMints(identityFrom, identityTo, mintCfg) : 0

  console.log(`\n--- [${cfg.label}] Indexing feedback ---`)
  const fbCfg = { ...cfg, stateId: reputationStateId }
  const feedback = reputationFrom <= reputationTo ? await indexFeedback(reputationFrom, reputationTo, fbCfg) : 0

  return { mints, feedback }
}

async function main() {
  console.log('\n=== ERC-8004 Indexer (Multi-chain) ===\n')

  const startTime = Date.now()
  let totalMints = 0
  let totalFeedback = 0

  // Index Ethereum
  if (!chainArg || chainArg === 'ethereum') {
    console.log('--- Ethereum ---')
    const result = await indexChain(ETH_CONFIG, IDENTITY_DEPLOY_BLOCK, REPUTATION_DEPLOY_BLOCK)
    totalMints += result.mints
    totalFeedback += result.feedback
  }

  // Index Base
  if (!chainArg || chainArg === 'base') {
    console.log('\n--- Base ---')
    const result = await indexChain(BASE_CONFIG, BASE_IDENTITY_DEPLOY_BLOCK, BASE_REPUTATION_DEPLOY_BLOCK)
    totalMints += result.mints
    totalFeedback += result.feedback
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // Summary
  const walletCount = await sql`SELECT COUNT(*) as count FROM wallets`
  const feedbackCount = await sql`SELECT COUNT(*) as count FROM feedback`
  const dbSize = await sql`SELECT pg_database_size(current_database()) as size`
  const sizeMB = (Number(dbSize[0].size) / 1024 / 1024).toFixed(1)

  console.log('\n=== Summary ===')
  console.log(`Time: ${elapsed}s`)
  console.log(`New mints found: ${totalMints}`)
  console.log(`New feedback found: ${totalFeedback}`)
  console.log(`Total wallets in DB: ${walletCount[0].count}`)
  console.log(`Total feedback in DB: ${feedbackCount[0].count}`)
  console.log(`DB size: ${sizeMB} MB / 500 MB`)
  console.log('CU usage:', getCUUsage())

  await sql.end()
}

main().catch(async (err) => {
  console.error('Indexer failed:', err)
  await sql.end()
  process.exit(1)
})
