/**
 * Phase 0.5 — Validate we can read blockchain data.
 *
 * Tests:
 *   1. getLogs → IdentityRegistry mint events (10 blocks from deploy)
 *   2. getLogs → ReputationRegistry NewFeedback events (10 blocks sample)
 *   3. getLogs → Base USDC AuthorizationUsed events (last 10 blocks)
 *   4. receipt → Match AuthorizationUsed with Transfer in same tx
 *
 * Alchemy free tier: 10 blocks max per getLogs call.
 * Expected CU cost: ~300 (negligible)
 */

import { parseAbiItem, formatUnits } from 'viem'
import { ethClient, baseClient } from '../src/config/chains.js'
import {
  IDENTITY_REGISTRY,
  REPUTATION_REGISTRY,
  IDENTITY_DEPLOY_BLOCK,
  REPUTATION_DEPLOY_BLOCK,
  BASE_USDC,
  TRANSFER_TOPIC,
  KNOWN_FACILITATORS,
  BATCH_SIZE,
} from '../src/config/constants.js'

let passed = 0
let failed = 0
let skipped = 0

function ok(name: string, detail: string) {
  passed++
  console.log(`  PASS  ${name} — ${detail}`)
}

function fail(name: string, err: unknown) {
  failed++
  const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
  console.log(`  FAIL  ${name} — ${msg}`)
}

function skip(name: string, reason: string) {
  skipped++
  console.log(`  SKIP  ${name} — ${reason}`)
}

console.log('\n=== AgentKarma Phase 0.5 — RPC Validation ===')
console.log(`    Batch size: ${BATCH_SIZE} blocks (Alchemy free tier limit)\n`)

// ============================================================
// ETHEREUM TESTS
// ============================================================
console.log('--- Ethereum Mainnet ---\n')

// --- Test 1: Mint events on IdentityRegistry ---
console.log('[1/4] ERC-8004 IdentityRegistry mint events...')
try {
  const mintLogs = await ethClient.getLogs({
    address: IDENTITY_REGISTRY,
    event: parseAbiItem(
      'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
    ),
    args: { from: '0x0000000000000000000000000000000000000000' },
    fromBlock: IDENTITY_DEPLOY_BLOCK,
    toBlock: IDENTITY_DEPLOY_BLOCK + BATCH_SIZE - 1n,
  })
  ok('mint events', `${mintLogs.length} mints in blocks ${IDENTITY_DEPLOY_BLOCK}–${IDENTITY_DEPLOY_BLOCK + BATCH_SIZE - 1n}`)
  if (mintLogs.length > 0) {
    const first = mintLogs[0]
    console.log(`         First: tokenId=${first.args.tokenId}, to=${first.args.to}, block=${first.blockNumber}`)
  } else {
    console.log('         (No mints in this block range — try a wider scan later)')
  }
} catch (e) {
  fail('mint events', e)
}

// --- Test 2: NewFeedback on ReputationRegistry ---
console.log('[2/4] ERC-8004 ReputationRegistry NewFeedback events...')
try {
  const feedbackLogs = await ethClient.getLogs({
    address: REPUTATION_REGISTRY,
    event: parseAbiItem(
      'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)'
    ),
    fromBlock: REPUTATION_DEPLOY_BLOCK,
    toBlock: REPUTATION_DEPLOY_BLOCK + BATCH_SIZE - 1n,
  })
  ok('feedback events', `${feedbackLogs.length} feedback events in blocks ${REPUTATION_DEPLOY_BLOCK}–${REPUTATION_DEPLOY_BLOCK + BATCH_SIZE - 1n}`)
  if (feedbackLogs.length > 0) {
    const first = feedbackLogs[0]
    console.log(`         First: agentId=${first.args.agentId}, client=${first.args.clientAddress}, value=${first.args.value}`)
  } else {
    console.log('         (No feedback in this block range — expected, feedback is sparse)')
  }
} catch (e) {
  fail('feedback events', e)
}

// ============================================================
// BASE TESTS
// ============================================================
console.log('\n--- Base L2 ---\n')

// --- Test 3: AuthorizationUsed on Base USDC ---
console.log('[3/4] Base USDC AuthorizationUsed events...')
type AuthLog = Awaited<ReturnType<typeof baseClient.getLogs>>[number]
let authLogs: AuthLog[] = []
let baseAvailable = true

try {
  const currentBlock = await baseClient.getBlockNumber()
  authLogs = await baseClient.getLogs({
    address: BASE_USDC,
    event: parseAbiItem(
      'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)'
    ),
    fromBlock: currentBlock - BATCH_SIZE + 1n,
    toBlock: currentBlock,
  })
  ok('AuthorizationUsed', `${authLogs.length} events in last ${BATCH_SIZE} blocks (Base block ${currentBlock})`)
  if (authLogs.length > 0) {
    console.log(`         First: authorizer=${authLogs[0].args.authorizer}, tx=${authLogs[0].transactionHash}`)
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('not enabled') || msg.includes('not valid JSON')) {
    skip('AuthorizationUsed', 'Base not enabled on Alchemy. Enable at: https://dashboard.alchemy.com → your app → Networks → Base Mainnet')
    baseAvailable = false
  } else {
    fail('AuthorizationUsed', e)
  }
}

// --- Test 4: Match with Transfer in same tx ---
console.log('[4/4] Match AuthorizationUsed → Transfer in same tx...')
if (!baseAvailable) {
  skip('receipt match', 'Base not enabled (see test 3)')
} else if (authLogs.length === 0) {
  skip('receipt match', 'No AuthorizationUsed events found in last 10 blocks — try again later')
} else {
  try {
    const txHash = authLogs[0].transactionHash
    const [receipt, tx] = await Promise.all([
      baseClient.getTransactionReceipt({ hash: txHash }),
      baseClient.getTransaction({ hash: txHash }),
    ])

    const isFacilitator = KNOWN_FACILITATORS.has(tx.from.toLowerCase())

    const transfers = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === BASE_USDC.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC
    )

    if (transfers.length > 0) {
      const t = transfers[0]
      const payer = '0x' + t.topics[1]!.slice(26)
      const recipient = '0x' + t.topics[2]!.slice(26)
      const amountRaw = BigInt(t.data)
      const amountUSDC = formatUnits(amountRaw, 6)

      ok('receipt match', `$${amountUSDC} USDC: ${payer.slice(0, 10)}… → ${recipient.slice(0, 10)}…`)
      console.log(`         Gas payer: ${tx.from}`)
      console.log(`         Known facilitator: ${isFacilitator ? 'YES' : 'NO'}`)
    } else {
      ok('receipt match', 'AuthorizationUsed found but no USDC Transfer in same tx (possible non-x402 use of EIP-3009)')
    }
  } catch (e) {
    fail('receipt match', e)
  }
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${skipped} skipped ===`)
if (failed > 0) {
  console.log('\nFIX FAILURES BEFORE PROCEEDING TO PHASE 1.')
  process.exit(1)
} else if (skipped > 0) {
  console.log('\nEthereum tests passed. Enable Base on Alchemy dashboard to unlock x402 indexer.')
  console.log('You can proceed with ERC-8004 indexer (Phase 1a) now.')
} else {
  console.log('\nAll tests passed. Ready to build Phase 1.')
}
