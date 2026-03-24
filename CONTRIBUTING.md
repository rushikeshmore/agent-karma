# Contributing to AgentKarma

Thanks for your interest in contributing! AgentKarma is an open-source credit bureau for AI agent wallets.

## Ways to Contribute

- **Report bugs** — Open an issue with steps to reproduce
- **Propose integrations** — New data sources, scoring signals, or chain support
- **Improve docs** — Fix typos, add examples, clarify API usage
- **Submit code** — Bug fixes, new features, performance improvements

## Development Setup

```bash
git clone https://github.com/rushikeshmore/agent-karma.git
cd agent-karma
npm install

# Copy env vars
cp .env.example .env
# Fill in: alchemy_key, neon_db_key

# Run tests
npm test

# Start local dev server
npm run dev
```

## Project Structure

```
src/
  api/routes.ts      — Node.js API (Hono + postgres.js)
  worker.ts          — Cloudflare Worker API (Hono + Neon HTTP)
  scoring/compute.ts — Trust score algorithm (7 signals)
  indexer/erc8004.ts — ERC-8004 identity + reputation indexer
  indexer/x402.ts    — x402 payment indexer
  mcp/server.ts      — MCP server (7 tools)
  db/migrate.ts      — Database migrations
sdk/                 — TypeScript SDK (npm: agentkarma)
packages/dashboard/  — Next.js dashboard (agentkarma.dev)
```

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes with clear commit messages
3. Add tests if applicable (`npm test`)
4. Ensure `npm run build` passes
5. Open a PR with a description of what and why

## Scoring Algorithm Changes

The scoring algorithm is the core of AgentKarma. Changes to signal weights or formulas need:
- Justification (research, data analysis, or identified gaming vector)
- Before/after impact on the score distribution
- No regressions on existing Sybil resistance

## Code Style

- TypeScript strict mode
- No `any` types unless unavoidable
- Explicit SQL column lists (no `SELECT *`)
- Parameterized queries only (no string interpolation in SQL)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
