import { createPublicClient, http } from 'viem'
import { mainnet, base, arbitrum, bsc } from 'viem/chains'
import { env } from './env.js'

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${env.alchemyKey}`),
})

export const baseClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${env.alchemyKey}`),
})

// Base public RPC — supports 10K block getLogs ranges, no CU cost
// Use for indexer catch-up to avoid burning Alchemy CU on empty blocks
// mainnet.base.org has been flaky (503 "no backend healthy") — publicnode as fallback
export const basePublicClient = createPublicClient({
  chain: base,
  transport: http('https://base-rpc.publicnode.com'),
})

export const arbClient = createPublicClient({
  chain: arbitrum,
  transport: http(`https://arb-mainnet.g.alchemy.com/v2/${env.alchemyKey}`),
})

// BNB Chain — NodeReal public RPC (10-block getLogs max, rate limited)
// TODO: Enable BNB on Alchemy dashboard for 2K-block batches: https://dashboard.alchemy.com/apps/xk5kkkd5581x0m5q/networks
export const bscClient = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3'),
})
