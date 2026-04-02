import postgres from 'postgres'
import { env } from '../config/env.js'

const sql = postgres(env.databaseUrl, {
  ssl: 'require',
  max: 5,
  idle_timeout: 60,       // was 20s — Neon drops idle connections, give more headroom
  connect_timeout: 30,    // was 10s — receipt fetches are slow, need more time
  max_lifetime: 1800,     // recycle connections every 30min to avoid stale sockets
})

export default sql
