import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm --prefix ../apps/server run start',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: true,
      env: {
        PORT: '8787',
        HUMAN_AGENT_PLAYGROUND_DATA_PATH: '../../.human-agent-playground-data/e2e-sessions.json',
      },
    },
    {
      command: 'npm --prefix ../apps/web run start',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      env: {
        VITE_API_URL: 'http://127.0.0.1:8787',
      },
    },
  ],
})
