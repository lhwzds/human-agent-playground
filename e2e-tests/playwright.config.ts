import { defineConfig } from '@playwright/test'

const apiPort = process.env.PLAYGROUND_API_PORT ?? '8791'
const webPort = process.env.PLAYGROUND_WEB_PORT ?? '4179'
const bridgePort = process.env.PLAYGROUND_AI_BRIDGE_PORT ?? '8795'
const apiBaseUrl = process.env.PLAYGROUND_API_URL ?? `http://127.0.0.1:${apiPort}`
const webBaseUrl = process.env.PLAYGROUND_WEB_URL ?? `http://127.0.0.1:${webPort}`
const bridgeBaseUrl =
  process.env.PLAYGROUND_AI_BRIDGE_URL ?? `http://127.0.0.1:${bridgePort}`

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'rm -f ../../.human-agent-playground-data/e2e-restflow.db && cargo run --manifest-path ../apps/ai-bridge/Cargo.toml',
      url: `${bridgeBaseUrl}/health`,
      reuseExistingServer: false,
      env: {
        PORT: bridgePort,
        HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_DATA_PATH:
          '../../.human-agent-playground-data/e2e-restflow.db',
        HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_FORCE_FIRST_LEGAL: '1',
      },
    },
    {
      command: 'rm -f ../../.human-agent-playground-data/e2e-sessions.json && npm --prefix ../apps/server run start',
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: false,
      env: {
        PORT: apiPort,
        HUMAN_AGENT_PLAYGROUND_DATA_PATH: '../../.human-agent-playground-data/e2e-sessions.json',
        HUMAN_AGENT_PLAYGROUND_AI_BRIDGE_URL: bridgeBaseUrl,
      },
    },
    {
      command: `npm --prefix ../apps/web run start -- --port ${webPort}`,
      url: webBaseUrl,
      reuseExistingServer: false,
      env: {
        VITE_API_URL: apiBaseUrl,
      },
    },
  ],
})
