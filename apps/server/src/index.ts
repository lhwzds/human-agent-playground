import { createServer } from 'node:http'

import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 8787)
const app = createApp()

createServer(app).listen(port, () => {
  console.log(`Human Agent Playground server listening on http://127.0.0.1:${port}`)
})
