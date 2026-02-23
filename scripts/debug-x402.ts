/**
 * Debug script: inspect a single AuthorizationUsed receipt to understand
 * why Transfer events aren't being matched.
 */

import { parseAbiItem } from 'viem'
import { baseClient } from '../src/config/chains.js'
import { BASE_USDC, TRANSFER_TOPIC, BATCH_SIZE } from '../src/config/constants.js'

async function main() {
  const currentBlock = await baseClient.getBlockNumber()

  // Scan in 10-block batches until we find some events
  let authLogs: any[] = []
  let scanFrom = currentBlock - 10n
  const maxBatches = 50

  console.log(`Scanning from block ${scanFrom} in 10-block batches (up to ${maxBatches} batches)...\n`)

  for (let i = 0; i < maxBatches && authLogs.length === 0; i++) {
    const batchEnd = scanFrom + 9n
    const logs = await baseClient.getLogs({
      address: BASE_USDC,
      event: parseAbiItem(
        'event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)'
      ),
      fromBlock: scanFrom,
      toBlock: batchEnd > currentBlock ? currentBlock : batchEnd,
    })
    if (logs.length > 0) {
      authLogs = logs
      console.log(`Found events in blocks ${scanFrom}–${batchEnd}`)
    }
    scanFrom = scanFrom - 10n
  }

  console.log(`Found ${authLogs.length} AuthorizationUsed events\n`)

  if (authLogs.length === 0) {
    console.log('No events found. Try a larger block range.')
    return
  }

  // Inspect the first 3 receipts
  const txHashes = [...new Set(authLogs.map((l) => l.transactionHash))].slice(0, 3)

  for (const txHash of txHashes) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`TX: ${txHash}`)
    console.log(`${'='.repeat(80)}`)

    const receipt = await baseClient.getTransactionReceipt({ hash: txHash })
    const tx = await baseClient.getTransaction({ hash: txHash })

    console.log(`From: ${tx.from}`)
    console.log(`To: ${tx.to}`)
    console.log(`Block: ${receipt.blockNumber}`)
    console.log(`Total logs in receipt: ${receipt.logs.length}`)
    console.log(`\nAll logs:`)

    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i]
      console.log(`\n  Log #${i}:`)
      console.log(`    Address: ${log.address}`)
      console.log(`    Topics[0]: ${log.topics[0]}`)
      console.log(`    Topics count: ${log.topics.length}`)
      if (log.topics.length > 1) console.log(`    Topics[1]: ${log.topics[1]}`)
      if (log.topics.length > 2) console.log(`    Topics[2]: ${log.topics[2]}`)
      console.log(`    Data: ${log.data.slice(0, 66)}${log.data.length > 66 ? '...' : ''}`)

      // Check if this is a Transfer from BASE_USDC
      const isUSDC = log.address.toLowerCase() === BASE_USDC.toLowerCase()
      const isTransfer = log.topics[0] === TRANSFER_TOPIC
      console.log(`    Is USDC contract: ${isUSDC}`)
      console.log(`    Is Transfer event: ${isTransfer}`)

      if (isTransfer) {
        const from = '0x' + log.topics[1]!.slice(26)
        const to = '0x' + log.topics[2]!.slice(26)
        const amount = BigInt(log.data)
        console.log(`    Transfer: ${from} → ${to} (${amount} raw)`)
      }
    }

    // Explicitly check our filter
    const transfers = receipt.logs.filter(
      (log) =>
        log.address.toLowerCase() === BASE_USDC.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC
    )
    console.log(`\n  >>> Matched USDC Transfers: ${transfers.length}`)
  }
}

main().catch(console.error)
