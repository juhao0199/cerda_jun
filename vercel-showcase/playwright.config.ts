import { defineConfig, devices } from '@playwright/test';
const port = 3112;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`,
    connectOptions: process.env.PLAYWRIGHT_WS_ENDPOINT ? { wsEndpoint: process.env.PLAYWRIGHT_WS_ENDPOINT, exposeNetwork: '<loopback>' } : undefined,
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER ? undefined : {
    command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${port}`,
    port, timeout: 180000, reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
