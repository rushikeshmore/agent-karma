// ERC-8004 Contracts (Ethereum Mainnet)
export const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const
export const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as const
export const IDENTITY_DEPLOY_BLOCK = 24339925n  // first mint: Jan 29 2026
export const REPUTATION_DEPLOY_BLOCK = 24339925n // same block — both went live together

// USDC on Base (x402 payments settle here)
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// Known x402 facilitator wallets (gas payers for transferWithAuthorization)
export const KNOWN_FACILITATORS = new Set([
  '0xa9236f4950001355455a5b016a25fa27b947c9ac',
])

// ERC-20 Transfer event topic hash: keccak256("Transfer(address,address,uint256)")
export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as const

// Indexer tuning — Alchemy free tier limits getLogs to 10 blocks per query
export const BATCH_SIZE = 10n          // blocks per eth_getLogs call (Alchemy free limit)
export const BATCH_DELAY_MS = 100      // ms between batches (Ethereum)
export const BATCH_DELAY_BASE_MS = 100 // ms between batches (Base)
export const RECEIPT_DELAY_MS = 50     // ms between individual receipt fetches

// Alchemy CU costs per method
export const CU_COSTS: Record<string, number> = {
  eth_getLogs: 75,
  eth_call: 26,
  eth_getBlockByNumber: 16,
  eth_getTransactionReceipt: 15,
  eth_getTransaction: 13,
  eth_blockNumber: 0,
}

// Budget
export const MONTHLY_CU_BUDGET = 30_000_000
export const CU_WARNING_THRESHOLD = 0.8
