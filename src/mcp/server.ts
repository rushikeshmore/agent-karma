/**
 * AgentKarma MCP Server
 *
 * Exposes wallet trust data to AI agents via Model Context Protocol.
 * Runs locally via stdio transport — no hosting required.
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
import sql from '../db/client.js'

const server = new McpServer({
  name: 'agent-karma',
  version: '0.5.0',
  description: 'Credit bureau for AI agent wallets. Look up trust data for any wallet address.',
})

// --- Tool 1: lookup_wallet ---
server.registerTool(
  'lookup_wallet',
  {
    description:
      'Look up a wallet address to see if it belongs to a known AI agent. Returns source (erc8004/x402/both), transaction count, ERC-8004 agent ID, and when it was first/last seen.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('EVM wallet address (0x...)'),
    },
  },
  async ({ address }) => {
    const addr = address.toLowerCase()
    const wallet = await sql`SELECT * FROM wallets WHERE address = ${addr}`

    if (wallet.length === 0) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ found: false, address: addr, message: 'Wallet not found in AgentKarma index. This address has no known AI agent activity.' }, null, 2) }],
      }
    }

    const w = wallet[0]
    const txCount = await sql`SELECT COUNT(*) as count FROM transactions WHERE payer = ${addr} OR recipient = ${addr}`
    const feedbackCount = await sql`
      SELECT COUNT(*) as count FROM feedback f
      JOIN wallets w ON f.agent_id = w.erc8004_id
      WHERE w.address = ${addr}
    `

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          found: true,
          address: w.address,
          source: w.source,
          chain: w.chain,
          erc8004_id: w.erc8004_id,
          trust_score: w.trust_score,
          score_breakdown: w.score_breakdown,
          scored_at: w.scored_at,
          tx_count: Number(w.tx_count ?? 0),
          transaction_count: Number(txCount[0].count),
          feedback_count: Number(feedbackCount[0].count),
          first_seen_block: w.first_seen_block,
          first_seen_at: w.first_seen_at,
          last_seen_at: w.last_seen_at,
        }, null, 2),
      }],
    }
  }
)

// --- Tool 2: get_wallet_trust_signals ---
server.registerTool(
  'get_wallet_trust_signals',
  {
    description:
      'Get trust indicators for a wallet address. Returns transaction history, counterparty diversity, feedback scores, and activity patterns. Use this to assess whether an AI agent wallet is trustworthy before transacting.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('EVM wallet address (0x...)'),
    },
  },
  async ({ address }) => {
    const addr = address.toLowerCase()
    const wallet = await sql`SELECT * FROM wallets WHERE address = ${addr}`

    if (wallet.length === 0) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ found: false, address: addr, trust_signals: null, message: 'No data available for this address.' }, null, 2) }],
      }
    }

    // Get transaction stats
    const txStats = await sql`
      SELECT
        COUNT(*) as total_txns,
        COUNT(DISTINCT CASE WHEN payer = ${addr} THEN recipient ELSE payer END) as unique_counterparties,
        SUM(amount_usdc) as total_volume_usdc,
        MIN(block_number) as first_tx_block,
        MAX(block_number) as last_tx_block
      FROM transactions
      WHERE payer = ${addr} OR recipient = ${addr}
    `

    // Get feedback stats
    const feedbackStats = await sql`
      SELECT
        COUNT(*) as total_feedback,
        AVG(value::numeric) as avg_value
      FROM feedback f
      JOIN wallets w ON f.agent_id = w.erc8004_id
      WHERE w.address = ${addr}
    `

    // Recent transactions (last 5)
    const recentTxns = await sql`
      SELECT tx_hash, block_number, payer, recipient, amount_usdc, is_x402
      FROM transactions
      WHERE payer = ${addr} OR recipient = ${addr}
      ORDER BY block_number DESC
      LIMIT 5
    `

    const stats = txStats[0]
    const fb = feedbackStats[0]

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          found: true,
          address: addr,
          source: wallet[0].source,
          erc8004_registered: wallet[0].erc8004_id !== null,
          erc8004_id: wallet[0].erc8004_id,
          trust_score: wallet[0].trust_score,
          score_breakdown: wallet[0].score_breakdown,
          trust_signals: {
            total_transactions: Number(stats.total_txns),
            unique_counterparties: Number(stats.unique_counterparties),
            total_volume_usdc: Number(stats.total_volume_usdc ?? 0),
            total_feedback: Number(fb.total_feedback),
            avg_feedback_value: fb.avg_value ? Number(fb.avg_value) : null,
            activity_span_blocks: stats.first_tx_block && stats.last_tx_block
              ? Number(stats.last_tx_block) - Number(stats.first_tx_block)
              : 0,
          },
          recent_transactions: recentTxns.map((t: any) => ({
            tx_hash: t.tx_hash,
            block: t.block_number,
            role: t.payer === addr ? 'payer' : 'recipient',
            counterparty: t.payer === addr ? t.recipient : t.payer,
            amount_usdc: Number(t.amount_usdc),
            is_x402: t.is_x402,
          })),
        }, null, 2),
      }],
    }
  }
)

// --- Tool 3: get_trust_score ---
server.registerTool(
  'get_trust_score',
  {
    description:
      'Get the trust score (0-100) for an AI agent wallet. Returns a weighted score based on: loyalty (30%), activity (18%), diversity (16%), feedback (15%), volume (10%), recency (6%), and age (5%). ERC-8004 registered agents get a +5 bonus. Use this to quickly assess if a wallet is trustworthy before transacting.',
    inputSchema: {
      address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .describe('EVM wallet address (0x...)'),
    },
  },
  async ({ address }) => {
    const addr = address.toLowerCase()
    const wallet = await sql`
      SELECT address, trust_score, score_breakdown, scored_at, source, tx_count, erc8004_id
      FROM wallets WHERE address = ${addr}
    `

    if (wallet.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            found: false,
            address: addr,
            trust_score: null,
            message: 'Wallet not found. No AI agent activity detected for this address.',
          }, null, 2),
        }],
      }
    }

    const w = wallet[0]
    const tierLabel = w.trust_score == null ? null :
      w.trust_score >= 80 ? 'HIGH' :
      w.trust_score >= 50 ? 'MEDIUM' :
      w.trust_score >= 20 ? 'LOW' : 'MINIMAL'

    let percentile: number | null = null
    if (w.trust_score != null) {
      const pctResult = await sql`
        SELECT
          COUNT(*) FILTER (WHERE trust_score <= ${w.trust_score})::float
          / NULLIF(COUNT(*), 0) * 100 AS percentile
        FROM wallets WHERE trust_score IS NOT NULL
      `
      percentile = pctResult[0].percentile != null ? Math.round(pctResult[0].percentile) : null
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          found: true,
          address: w.address,
          trust_score: w.trust_score,
          tier: tierLabel,
          percentile,
          breakdown: w.score_breakdown,
          scored_at: w.scored_at,
          source: w.source,
          tx_count: Number(w.tx_count ?? 0),
          erc8004_registered: w.erc8004_id !== null,
        }, null, 2),
      }],
    }
  }
)

// --- Tool 3b: batch_trust_scores ---
server.registerTool(
  'batch_trust_scores',
  {
    description:
      'Look up trust scores for multiple wallet addresses at once (max 100). Returns scores for found wallets and a list of addresses not found.',
    inputSchema: {
      addresses: z
        .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/))
        .max(100)
        .describe('Array of EVM wallet addresses (0x...)'),
    },
  },
  async ({ addresses }) => {
    const normalized = addresses.map((a: string) => a.toLowerCase())
    const wallets = await sql`
      SELECT address, trust_score, score_breakdown, scored_at, source, tx_count, erc8004_id
      FROM wallets WHERE address = ANY(${normalized})
    `

    const found = new Map(wallets.map((w: any) => [w.address, w]))
    const scores = []
    const notFound = []

    for (const addr of normalized) {
      const w = found.get(addr)
      if (w) {
        const tier = w.trust_score == null ? null :
          w.trust_score >= 80 ? 'HIGH' :
          w.trust_score >= 50 ? 'MEDIUM' :
          w.trust_score >= 20 ? 'LOW' : 'MINIMAL'
        scores.push({
          address: w.address,
          trust_score: w.trust_score,
          tier,
          breakdown: w.score_breakdown,
          scored_at: w.scored_at,
        })
      } else {
        notFound.push(addr)
      }
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ scores, not_found: notFound }, null, 2),
      }],
    }
  }
)

// --- Tool 4: list_wallets ---
server.registerTool(
  'list_wallets',
  {
    description:
      'Browse indexed AI agent wallets. Filter by data source (erc8004 = registered agents, x402 = payment activity, both = seen in both). Returns a paginated list.',
    inputSchema: {
      source: z
        .enum(['erc8004', 'x402', 'both', 'all'])
        .default('all')
        .describe('Filter by data source'),
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
        .default(0)
        .describe('Pagination offset'),
    },
  },
  async ({ source, limit, offset }) => {
    let wallets
    if (source === 'all') {
      wallets = await sql`
        SELECT address, source, chain, erc8004_id, tx_count, first_seen_at, last_seen_at
        FROM wallets ORDER BY last_seen_at DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      wallets = await sql`
        SELECT address, source, chain, erc8004_id, tx_count, first_seen_at, last_seen_at
        FROM wallets WHERE source = ${source} ORDER BY last_seen_at DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}
      `
    }

    const total = await sql`SELECT COUNT(*) as count FROM wallets ${source !== 'all' ? sql`WHERE source = ${source}` : sql``}`

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          total: Number(total[0].count),
          offset,
          limit,
          wallets: wallets.map((w: any) => ({
            address: w.address,
            source: w.source,
            chain: w.chain,
            erc8004_id: w.erc8004_id,
            tx_count: Number(w.tx_count ?? 0),
            last_seen: w.last_seen_at,
          })),
        }, null, 2),
      }],
    }
  }
)

// --- Tool 5: agentkarma_stats ---
server.registerTool(
  'agentkarma_stats',
  {
    description: 'Get AgentKarma database statistics: total wallets, transactions, feedback count, and database size.',
    inputSchema: {},
  },
  async () => {
    const walletCount = await sql`SELECT COUNT(*) as count FROM wallets`
    const txCount = await sql`SELECT COUNT(*) as count FROM transactions`
    const feedbackCount = await sql`SELECT COUNT(*) as count FROM feedback`
    const dbSize = await sql`SELECT pg_database_size(current_database()) as size`
    const sources = await sql`SELECT source, COUNT(*) as count FROM wallets GROUP BY source`

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          total_wallets: Number(walletCount[0].count),
          total_transactions: Number(txCount[0].count),
          total_feedback: Number(feedbackCount[0].count),
          db_size_mb: (Number(dbSize[0].size) / 1024 / 1024).toFixed(1),
          db_limit_mb: 500,
          wallets_by_source: Object.fromEntries(
            sources.map((s: any) => [s.source, Number(s.count)])
          ),
        }, null, 2),
      }],
    }
  }
)

// --- Tool 6: manage_webhooks ---
server.registerTool(
  'manage_webhooks',
  {
    description:
      'Manage score change webhooks. Actions: "list" (show all), "register" (create new), "delete" (remove by ID). Webhooks fire HTTP POST notifications when wallet trust scores change.',
    inputSchema: {
      action: z
        .enum(['list', 'register', 'delete'])
        .describe('Action to perform'),
      api_key: z
        .string()
        .describe('Your API key (required for all webhook operations)'),
      url: z
        .string()
        .optional()
        .describe('Webhook URL (required for register)'),
      wallet_address: z
        .string()
        .regex(/^0x[a-fA-F0-9]{40}$/)
        .optional()
        .describe('Optional: only fire for this wallet'),
      event_type: z
        .enum(['score_change', 'score_drop', 'score_rise'])
        .optional()
        .describe('Event type (default: score_change)'),
      threshold: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe('Optional: only fire when score crosses this value'),
      webhook_id: z
        .number()
        .int()
        .optional()
        .describe('Webhook ID (required for delete)'),
    },
  },
  async ({ action, api_key, url, wallet_address, event_type, threshold, webhook_id }) => {
    // Validate API key
    const keys = await sql`SELECT id FROM api_keys WHERE key = ${api_key} AND is_active = true`
    if (keys.length === 0) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid or inactive API key' }, null, 2) }],
      }
    }
    const apiKeyId = keys[0].id

    if (action === 'list') {
      const webhooks = await sql`
        SELECT id, url, wallet_address, event_type, threshold, is_active, created_at
        FROM webhooks WHERE api_key_id = ${apiKeyId}
        ORDER BY created_at DESC
      `
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ webhooks }, null, 2) }],
      }
    }

    if (action === 'register') {
      if (!url) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'url is required for register action' }, null, 2) }],
        }
      }
      const addr = wallet_address ? wallet_address.toLowerCase() : null
      const evt = event_type ?? 'score_change'

      const existing = await sql`SELECT COUNT(*)::int as count FROM webhooks WHERE api_key_id = ${apiKeyId}`
      if (existing[0].count >= 25) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Maximum 25 webhooks per API key' }, null, 2) }],
        }
      }

      const result = await sql`
        INSERT INTO webhooks (api_key_id, url, wallet_address, event_type, threshold)
        VALUES (${apiKeyId}, ${url}, ${addr}, ${evt}, ${threshold ?? null})
        RETURNING id, url, wallet_address, event_type, threshold, is_active, created_at
      `

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ registered: true, webhook: result[0] }, null, 2) }],
      }
    }

    if (action === 'delete') {
      if (webhook_id == null) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'webhook_id is required for delete action' }, null, 2) }],
        }
      }

      const result = await sql`
        DELETE FROM webhooks WHERE id = ${webhook_id} AND api_key_id = ${apiKeyId}
        RETURNING id
      `

      if (result.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Webhook not found or not owned by this key' }, null, 2) }],
        }
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ deleted: true, id: result[0].id }, null, 2) }],
      }
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Unknown action' }, null, 2) }],
    }
  }
)

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Use stderr — stdout is reserved for JSON-RPC in stdio mode
  console.error('AgentKarma MCP server running on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
