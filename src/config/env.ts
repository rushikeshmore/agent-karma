import 'dotenv/config'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const env = {
  alchemyKey: requireEnv('alchemy_key'),
  databaseUrl: requireEnv('neon_db_key'),
  port: Number(process.env.PORT ?? 3000),
}
