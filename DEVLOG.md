# AgentKarma Dev Log

## Session 6 — 2026-02-24

### SDK Fixes
- Fixed SDK types to match actual API response shapes (`trust_score` not `score`, nullable fields)
- Fixed `meetsThreshold()` to handle null scores
- Fixed `getLeaderboard()` to unwrap `{ leaderboard: [...] }` response
- Fixed `getTransactions()` to use `limit`/`offset` instead of `page`/`per_page`
- Added `WalletRole`, `WalletLookupResponse`, `TransactionsResponse` types

### Wallet Role Field
- Added `role` column to wallets table (`buyer` / `seller` / `both`)
- Role computed from transaction direction during scoring
- Added to all API responses, SDK types, and MCP tools

### Tests
- Added vitest with 55 tests (40 scoring engine + 15 SDK client)
- Scoring tests cover all 6 signals, edge cases (NaN, negative, zero, boundary), sybil cap, weight sum
- SDK tests mock `globalThis.fetch`, verify all 7 methods

---

## Session 5 — 2026-02-23

### Security Audit
7 issues found and fixed against OWASP Top 10:

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| SEC-01 | `sql.unsafe()` in scoring engine | HIGH | Parameterized `sql` tagged templates |
| SEC-02 | No address validation on API | HIGH | `validateAddress()` regex on all `:address` routes |
| SEC-03 | NaN/negative pagination params | MEDIUM | `safeInt()` helper with fallback |
| SEC-04 | Unbounded `source` param | MEDIUM | `validateSource()` allowlist |
| SEC-05 | No global error handler | MEDIUM | `app.onError()` — generic 500, no stack traces |
| SEC-06 | Unvalidated params in dashboard | MEDIUM | Hex address regex before fetch |
| SEC-07 | SDK sends unvalidated addresses | LOW | `assertAddress()` throwing AgentKarmaError |

### QA Fixes
- NaN propagation from invalid dates/negatives in scoring — added `isNaN()` guards
- Non-numeric PORT env — added range validation with fallback
- Inconsistent null check for trust_score — standardized across API

---

## Session 4 — 2026-02-23

### Auth Decision
- Built full API key auth system (table, middleware, key management endpoints)
- Reverted — public blockchain data + adoption-first = no auth friction
- Can add IP-based rate limiting via Cloudflare Workers later

---

## Session 3 — 2026-02-23

### Scoring Engine
- 6-signal weighted model: loyalty (32%), activity (20%), diversity (18%), feedback (15%), age (9%), recency (6%)
- Based on EigenTrust, zScore DeFi, Gitcoin Passport, Arbitrum sybil detection
- Performance: bulk `UPDATE ... FROM VALUES` CTE — 7.4s for 6,200 wallets (was 31 min with per-row UPDATEs)
- Score distribution: 2 HIGH, 57 MEDIUM, 277 LOW, 5,864 MINIMAL

### npm SDK
- Published `agentkarma` v0.1.0 to npm
- 7 methods, zero dependencies, full TypeScript types

### MCP Server
- Added `get_trust_score` tool (5 tools total)
- Trust scores included in all wallet responses

---

## Session 2 — 2026-02-23

### Phase 1 Build
- Full codebase: config, DB, indexers, API, MCP server
- ERC-8004 indexer: 6,200 agent wallet mints
- x402 indexer: 1,992 payment transactions
- 8 REST API endpoints via Hono

### Key Bugs Fixed
1. Wrong ERC-8004 deploy block — 21339871 → **24339925**
2. Alchemy 10-block limit — changed `BATCH_SIZE` from 2000 to 10
3. Batch insert duplicates — Map-based deduplication
4. Wrong Transfer topic hash — corrected to standard ERC-20

---

## Session 1 — 2026-02-23

- Research: A2A economic layer, ERC-8004, x402, scoring models
- Set up infrastructure: Alchemy (Ethereum + Base RPC), Neon Postgres
- Created project structure and initial configuration
