import postgres from 'postgres'
import { env } from '../config/env.js'

const sql = postgres(env.databaseUrl, {
  ssl: 'require',
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
})

export default sql
