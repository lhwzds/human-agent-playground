import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    headless: true,
  },
  webServer: {
    command: 'npm run dev --workspace @human-agent-playground/website',
    port: 4321,
    reuseExistingServer: true,
  },
})
