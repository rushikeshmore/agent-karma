/**
 * Idempotent schema migration — safe to run multiple times.
 * Uses IF NOT EXISTS throughout.
 */

import sql from './client.js'

async function migrate() {
  console.log('Running migrations...\n')

  // --- wallets ---
  await sql`
    CREATE TABLE IF NOT EXISTS wallets (
      id              SERIAL PRIMARY KEY,
      address         VARCHAR(42) NOT NULL UNIQUE,
      source          VARCHAR(20) NOT NULL,
      chain           VARCHAR(20) NOT NULL,
      erc8004_id      INTEGER,
      first_seen_block BIGINT,
      first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tx_count        INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address)`
  await sql`CREATE INDEX IF NOT EXISTS idx_wallets_source ON wallets(source)`
  console.log('  wallets table ready')

  // --- transactions (x402 payments) ---
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id              SERIAL PRIMARY KEY,
      tx_hash         VARCHAR(66) NOT NULL,
      block_number    BIGINT NOT NULL,
      chain           VARCHAR(20) NOT NULL,
      authorizer      VARCHAR(42) NOT NULL,
      payer           VARCHAR(42),
      recipient       VARCHAR(42),
      amount_raw      VARCHAR(78),
      amount_usdc     NUMERIC(20,6),
      facilitator     VARCHAR(42),
      is_x402         BOOLEAN NOT NULL DEFAULT false,
      block_timestamp TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_authorizer ON transactions(authorizer)`
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_payer ON transactions(payer)`
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_recipient ON transactions(recipient)`
  await sql`CREATE INDEX IF NOT EXISTS idx_tx_block ON transactions(block_number)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_hash_chain ON transactions(tx_hash, chain)`
  console.log('  transactions table ready')

  // --- feedback (ERC-8004 NewFeedback) ---
  await sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id              SERIAL PRIMARY KEY,
      agent_id        INTEGER NOT NULL,
      client_address  VARCHAR(42) NOT NULL,
      feedback_index  BIGINT NOT NULL,
      value           NUMERIC(38,18) NOT NULL,
      value_decimals  SMALLINT NOT NULL,
      tag1            TEXT,
      tag2            TEXT,
      endpoint        TEXT,
      feedback_uri    TEXT,
      feedback_hash   VARCHAR(66),
      block_number    BIGINT NOT NULL,
      tx_hash         VARCHAR(66) NOT NULL,
      block_timestamp TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_fb_agent_id ON feedback(agent_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_fb_client ON feedback(client_address)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_tx_idx ON feedback(tx_hash, feedback_index)`
  console.log('  feedback table ready')

  // --- indexer state (track scan progress) ---
  await sql`
    CREATE TABLE IF NOT EXISTS indexer_state (
      id              VARCHAR(50) PRIMARY KEY,
      last_block      BIGINT NOT NULL,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log('  indexer_state table ready')

  // --- add role column to wallets (added 2026-02-24) ---
  await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS role VARCHAR(10)`
  console.log('  wallets.role column ready')

  // --- v0.3: score_history table ---
  await sql`
    CREATE TABLE IF NOT EXISTS score_history (
      id              SERIAL PRIMARY KEY,
      address         VARCHAR(42) NOT NULL,
      trust_score     INTEGER NOT NULL,
      score_breakdown JSONB NOT NULL,
      computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_sh_address ON score_history(address)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sh_computed ON score_history(computed_at)`
  console.log('  score_history table ready')

  // --- v0.3: needs_rescore flag for incremental scoring ---
  await sql`ALTER TABLE wallets ADD COLUMN IF NOT EXISTS needs_rescore BOOLEAN DEFAULT true`
  console.log('  wallets.needs_rescore column ready')

  // --- v0.3: feedback source + target_address for API-submitted feedback ---
  await sql`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS source VARCHAR(10) DEFAULT 'chain'`
  await sql`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS target_address VARCHAR(42)`
  console.log('  feedback.source + target_address columns ready')

  // --- v0.4: api_keys table ---
  await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
      id              SERIAL PRIMARY KEY,
      key             VARCHAR(64) NOT NULL UNIQUE,
      name            VARCHAR(100) NOT NULL,
      tier            VARCHAR(20) NOT NULL DEFAULT 'free',
      daily_limit     INTEGER NOT NULL DEFAULT 1000,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key)`
  console.log('  api_keys table ready')

  // --- v0.4: api_usage table (daily request counts per key) ---
  // api_key_id = 0 is the sentinel for anonymous/unauthenticated requests
  await sql`
    CREATE TABLE IF NOT EXISTS api_usage (
      id              SERIAL PRIMARY KEY,
      api_key_id      INTEGER NOT NULL DEFAULT 0,
      date            DATE NOT NULL DEFAULT CURRENT_DATE,
      request_count   INTEGER NOT NULL DEFAULT 0,
      UNIQUE(api_key_id, date)
    )
  `
  console.log('  api_usage table ready')

  // --- v0.5: webhooks table ---
  await sql`
    CREATE TABLE IF NOT EXISTS webhooks (
      id              SERIAL PRIMARY KEY,
      api_key_id      INTEGER NOT NULL,
      url             TEXT NOT NULL,
      wallet_address  VARCHAR(42),
      event_type      VARCHAR(20) NOT NULL DEFAULT 'score_change',
      threshold       INTEGER,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_webhooks_api_key ON webhooks(api_key_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_webhooks_wallet ON webhooks(wallet_address)`
  console.log('  webhooks table ready')

  // --- check DB size ---
  const sizeResult = await sql`SELECT pg_database_size(current_database()) as size`
  const sizeMB = (Number(sizeResult[0].size) / 1024 / 1024).toFixed(1)
  console.log(`\nDB size: ${sizeMB} MB / 500 MB (Neon free tier)`)

  console.log('\nMigration complete.')
  await sql.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
