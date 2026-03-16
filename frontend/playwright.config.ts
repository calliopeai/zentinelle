import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'NEXT_PUBLIC_AUTH_MODE=standalone NEXT_PUBLIC_GQL_URL=http://localhost:8000/zentinelle/graphql NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev',
    url: 'http://localhost:3002/zentinelle/',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_AUTH_MODE: 'standalone',
      NEXT_PUBLIC_GQL_URL: 'http://localhost:8000/zentinelle/graphql',
      NEXT_PUBLIC_API_URL: 'http://localhost:8000',
    },
  },
});
