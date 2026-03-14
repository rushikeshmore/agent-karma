/**
 * AgentKarma MCP Server
 *
 * Exposes wallet trust data to AI agents via Model Context Protocol.
 * Calls the public AgentKarma REST API — no database or API keys required.
 *
 * Usage:
 *   npx tsx src/mcp/server.ts
 *
 * Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "agent-karma": {
 *         "command": "npx",
 *         "args": ["tsx", "src/mcp/server.ts"],
 *         "cwd": "/path/to/agent-karma"
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_BASE = process.env.AGENTKARMA_API_URL || 'https://agent-karma.rushikeshmore271.workers.dev'

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Accept': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body || res.statusText}`)
  }
  return res.json() as Promise<T>
}

function jsonText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

const server = new McpServer({
  name: 'agent-karma',
  version: '0.6.0',
  description: 'Credit bureau for AI agent wallets. Score any wallet address for trustworthiness using on-chain data from ERC-8004 and x402 protocols.',
})

// --- Tool 1: get_trust_score ---
// Primary tool for trust decisions. Returns score, tier, percentile, and full breakdown.
server.registerTool(
  'get_trust_score',
  {
    description:
      'Get the trust score (0-100) for an AI agent wallet address. Returns a weighted score based on 7 signals: loyalty (30%), activity (18%), diversity (16%), feedback (15%), volume (10%), recency (6%), age (5%). Includes tier (HIGH/MEDIUM/LOW/MINIMAL), percentile rank, and signal-by-signal breakdown. Use this as your primary tool for trust decisions before transacting.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('EVM wallet address (0x...)'),
    },
  },
  async ({ address }) => {
    try {
      const score = await api<any>(`/score/${address.toLowerCase()}`)
      return jsonText({ found: true, ...score })
    } catch (err: any) {
      if (err.message?.includes('404')) {
        return jsonText({ found: false, address: address.toLowerCase(), trust_score: null, message: 'Wallet not found. No AI agent activity detected for this address.' })
      }
      throw err
    }
  }
)

// --- Tool 2: lookup_wallet ---
// Identity and metadata tool. Use when you need wallet details beyond the trust score.
server.registerTool(
  'lookup_wallet',
  {
    description:
      'Get full wallet identity and metadata: source (erc8004/x402), chain, ERC-8004 agent ID, trust score with tier, transaction and feedback counts, and activity timestamps. Use this when you need wallet details beyond the trust score — e.g., "is this an ERC-8004 registered agent?" or "how many transactions has this wallet made?"',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('EVM wallet address (0x...)'),
    },
  },
  async ({ address }) => {
    try {
      const data = await api<any>(`/wallet/${address.toLowerCase()}`)
      return jsonText({ found: true, ...data })
    } catch (err: any) {
      if (err.message?.includes('404')) {
        return jsonText({ found: false, address: address.toLowerCase(), message: 'Wallet not found in AgentKarma index.' })
      }
      throw err
    }
  }
)

// --- Tool 3: get_wallet_trust_signals ---
// Deep dive tool. Combines score + transactions for full trust context.
server.registerTool(
  'get_wallet_trust_signals',
  {
    description:
      'Deep trust analysis for a wallet. Returns the trust score with breakdown PLUS recent transaction history showing counterparties, amounts, and roles (payer/recipient). Use this when you need to understand WHY a wallet has its score — e.g., before a high-value transaction where you want to see the wallet\'s actual on-chain behavior.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('EVM wallet address (0x...)'),
    },
  },
  async ({ address }) => {
    const addr = address.toLowerCase()
    try {
      const [score, txData] = await Promise.all([
        api<any>(`/score/${addr}`).catch(() => null),
        api<any>(`/wallet/${addr}/transactions?limit=5`).catch(() => ({ transactions: [] })),
      ])

      if (!score) {
        return jsonText({ found: false, address: addr, message: 'No data available for this address.' })
      }

      return jsonText({
        found: true,
        address: addr,
        trust_score: score.trust_score,
        tier: score.tier,
        percentile: score.percentile,
        score_breakdown: score.score_breakdown,
        source: score.source,
        tx_count: score.tx_count,
        recent_transactions: txData.transactions.slice(0, 5).map((t: any) => ({
          tx_hash: t.tx_hash,
          block: t.block_number,
          role: t.payer === addr ? 'payer' : 'recipient',
          counterparty: t.payer === addr ? t.recipient : t.payer,
          amount_usdc: t.amount_usdc,
          is_x402: t.is_x402,
        })),
      })
    } catch (err: any) {
      if (err.message?.includes('404')) {
        return jsonText({ found: false, address: addr, message: 'No data available for this address.' })
      }
      throw err
    }
  }
)

// --- Tool 4: batch_trust_scores ---
server.registerTool(
  'batch_trust_scores',
  {
    description:
      'Look up trust scores for multiple wallet addresses at once (max 100). Returns scores with tier and breakdown for found wallets, and a list of addresses not found. Use this when comparing multiple wallets or checking a batch of counterparties.',
    inputSchema: {
      addresses: z
        .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/))
        .max(100)
        .describe('Array of EVM wallet addresses (0x...)'),
    },
  },
  async ({ addresses }) => {
    const data = await api<any>('/wallets/batch-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: addresses.map(a => a.toLowerCase()) }),
    })
    return jsonText(data)
  }
)

// --- Tool 5: list_wallets ---
server.registerTool(
  'list_wallets',
  {
    description:
      'Browse indexed AI agent wallets. Filter by data source (erc8004 = registered agents, x402 = payment activity). Returns a paginated list sorted by recent activity.',
    inputSchema: {
      source: z
        .enum(['erc8004', 'x402', 'both'])
        .optional()
        .describe('Filter by data source (omit for all)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe('Number of wallets to return (max 50)'),
      offset: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .default(0)
        .describe('Pagination offset (max 10000)'),
    },
  },
  async ({ source, limit, offset }) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    if (source) params.set('source', source)
    const data = await api<any>(`/wallets?${params}`)
    return jsonText(data)
  }
)

// --- Tool 6: submit_feedback ---
server.registerTool(
  'submit_feedback',
  {
    description:
      'Submit feedback for a wallet after a transaction. Rate the experience 1-5 stars. This contributes to the wallet\'s trust score over time. Use this after completing a transaction to help build the trust network.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('Wallet address you transacted with'),
      tx_hash: z
        .string()
        .regex(/^0x[a-fA-F0-9]{64}$/)
        .describe('Transaction hash'),
      rating: z
        .number()
        .int()
        .min(1)
        .max(5)
        .describe('Rating 1-5 (1=terrible, 5=excellent)'),
      comment: z
        .string()
        .max(1000)
        .optional()
        .describe('Optional comment about the transaction'),
    },
  },
  async ({ address, tx_hash, rating, comment }) => {
    const data = await api<any>('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.toLowerCase(), tx_hash: tx_hash.toLowerCase(), rating, comment }),
    })
    return jsonText(data)
  }
)

// --- Tool 7: agentkarma_stats ---
server.registerTool(
  'agentkarma_stats',
  {
    description: 'Get AgentKarma platform statistics: total wallets indexed, transactions scored, feedback count, score distribution by tier, and database usage.',
    inputSchema: {},
  },
  async () => {
    const data = await api<any>('/stats')
    return jsonText(data)
  }
)

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('AgentKarma MCP server running on stdio')
  console.error(`API: ${API_BASE}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
