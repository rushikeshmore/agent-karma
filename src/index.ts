import { serve } from '@hono/node-server'
import app from './api/routes.js'
import { env } from './config/env.js'

console.log(`AgentKarma API starting on http://localhost:${env.port}`)

serve({ fetch: app.fetch, port: env.port })
