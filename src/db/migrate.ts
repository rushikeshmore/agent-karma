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
