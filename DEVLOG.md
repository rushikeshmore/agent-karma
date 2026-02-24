# AgentKarma Dev Log

## Session 5 — 2026-02-23: Security + QA Audit

### Security Audit (OWASP Top 10)
7 issues found and fixed:

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| SEC-01 | `sql.unsafe()` in scoring engine | HIGH | Replaced with parameterized `sql` tagged templates |
| SEC-02 | No address validation on REST API | HIGH | Added `validateAddress()` regex on all `:address` routes |
| SEC-03 | NaN/negative pagination params | MEDIUM | Added `safeInt()` helper with fallback |
| SEC-04 | Unbounded `source` param | MEDIUM | Added `validateSource()` allowlist (erc8004, x402, both) |
| SEC-05 | No global error handler | MEDIUM | Added `app.onError()` — returns generic 500, no stack traces |
| SEC-06 | Dashboard URL param unvalidated | MEDIUM | Added hex address regex before fetch |
| SEC-07 | SDK sends unvalidated addresses | LOW | Added `assertAddress()` throwing AgentKarmaError |

### QA Audit (Edge Cases)
3 issues found and fixed:

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| QA-01 | NaN propagation from invalid dates/negatives in scoring | HIGH | Added `isNaN()` guards + `<= 0` checks |
| QA-02 | Non-numeric PORT env causes NaN | LOW | Added range validation (0-65535) with fallback |
| QA-03 | Inconsistent null check for trust_score | MEDIUM | Changed `=== null` to `== null`, standardized response shape |

### Build Verification
- `npx tsc --noEmit` — 0 new errors
- SDK compile — clean
- `npx next build` — clean (4 routes)
- No services running (Neon suspended, Alchemy idle, CF Workers idle)

### Files Modified
`src/api/routes.ts`, `src/worker.ts`, `src/scoring/compute.ts`, `src/config/env.ts`, `packages/sdk/src/client.ts`, `packages/dashboard/app/wallet/[address]/page.tsx`

---

## Session 4 — 2026-02-23: Auth Decision + Full Codebase Review

### Auth — Built Then Reverted
- Built full auth system: `api_keys` table, middleware, key management endpoints
- User asked "do we need API key? since this is public tool?"
- **Answer: No.** Public blockchain data + want adoption first = no auth friction
- Reverted all auth code cleanly. Can add IP-based rate limiting via CF Workers later

### Full Codebase Audit
Scanned all 31 source files (~2,535 lines) against build plan and 3 session logs:
- Fixed stale Build-Plan.md (status, Phase 2f, next steps)
- Updated DEVLOG.md with sessions 3-4
- Updated README.md roadmap
- Cleaned up stale task trackers
- All code verified against build plan — everything matches

### Final Status: Phase 1 + Phase 2 COMPLETE
All code built. Only deployment steps remain (git push, wrangler deploy, Vercel, npm publish).

---

## Session 3 — 2026-02-23: Scoring Engine + SDK + Dashboard

### Scoring Engine v2
- 6-signal weighted model: loyalty (32%), activity (20%), diversity (18%), feedback (15%), age (9%), recency (6%)
- Based on: EigenTrust, zScore DeFi, Gitcoin Passport, Arbitrum Sybil detection
- Performance fix: bulk `UPDATE ... FROM VALUES` CTE — **7.4 seconds** for 6,200 wallets (was 31 min with per-row UPDATEs)
- Score distribution: 2 HIGH, 57 MEDIUM, 277 LOW, 5,864 MINIMAL

### API Updates
- `GET /score/:address` — trust score with tier (HIGH/MEDIUM/LOW/MINIMAL)
- `GET /leaderboard` — top wallets by score
- `GET /wallets?sort=score` — sortable by trust score
- Score distribution added to `GET /stats`
- All mirrored in Cloudflare Workers (`src/worker.ts`)

### MCP Server
- Added `get_trust_score` tool (now 5 tools total)
- Scores included in `lookup_wallet` and `get_wallet_trust_signals` responses

### npm SDK (`packages/sdk/`)
- Package: `agentkarma` v0.1.0
- Methods: `getScore()`, `isHighTrust()`, `meetsThreshold()`, `lookupWallet()`, `getTransactions()`, `getLeaderboard()`, `getStats()`
- Zero dependencies, full TypeScript types

### Dashboard (`packages/dashboard/`)
- Next.js 16 + Tailwind, dark zinc theme with amber-400 accent
- Home: wallet search + stats cards
- `/leaderboard`: top 100 wallets by score
- `/wallet/[address]`: score display + breakdown bars + wallet metadata
- Fixed: dynamic rendering (`force-dynamic`), API response shape matching, Next.js 15+ params pattern

### Backfill Completion
- ERC-8004 mints: 100% (6,200 wallets)
- ERC-8004 feedback: ~15% (676 entries, 25 unique agents — stopped, low impact)
- x402: 1,992 transactions (stopped — 7-day backfill too slow for Alchemy 10-block limit)
- All 6,200 wallets scored (100%)

---

## Session 2 — 2026-02-23: Phase 1 Build (All Code Complete)

### What Was Built
| Component | File | Status |
|-----------|------|--------|
| Config: env vars | `src/config/env.ts` | Done |
| Config: constants | `src/config/constants.ts` | Done |
| Config: viem clients | `src/config/chains.ts` | Done |
| DB: postgres client | `src/db/client.ts` | Done |
| DB: migration | `src/db/migrate.ts` | Done |
| CU budget tracker | `src/indexer/cu-tracker.ts` | Done |
| ERC-8004 indexer | `src/indexer/erc8004.ts` | Done |
| x402 indexer | `src/indexer/x402.ts` | Done |
| Hono API server | `src/api/routes.ts` | Done |
| Entry point | `src/index.ts` | Done |
| Phase 0.5 test | `scripts/test-rpc.ts` | All 4 tests pass |

### Bugs Found & Fixed
1. **Wrong deployment block** — 21339871 → actual **24339925** (Jan 29, 2026)
2. **Alchemy 10-block limit** — 2000 → **10** blocks per getLogs
3. **Batch insert duplicates** — Map-based deduplication before INSERT
4. **Wrong TRANSFER_TOPIC hash** — `...c550d1` → `...23b3ef`

---

## Session 1 — 2026-02-23: Research + Planning
- Full A2A economic layer exploration in Obsidian vault
- Chose AgentWalletScore as build target
- Created build plan, research spike, infra research
- Set up Alchemy + Neon accounts
- Created GitHub repo + git init
