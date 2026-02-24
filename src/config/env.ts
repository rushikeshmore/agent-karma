import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const rawPort = Number(process.env.PORT ?? 3000)

export const env = {
  alchemyKey: requireEnv('alchemy_key'),
  databaseUrl: requireEnv('neon_db_key'),
  port: Number.isNaN(rawPort) || rawPort <= 0 || rawPort > 65535 ? 3000 : rawPort,
}
