import { createPublicClient, http } from 'viem'
import { mainnet, base, arbitrum } from 'viem/chains'
import { env } from './env.js'

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(`https://eth-mainnet.g.alchemy.com/v2/${env.alchemyKey}`),
})

export const baseClient = createPublicClient({
  chain: base,
  transport: http(`https://base-mainnet.g.alchemy.com/v2/${env.alchemyKey}`),
})

export const arbClient = createPublicClient({
  chain: arbitrum,
  transport: http(`https://arb-mainnet.g.alchemy.com/v2/${env.alchemyKey}`),
})
