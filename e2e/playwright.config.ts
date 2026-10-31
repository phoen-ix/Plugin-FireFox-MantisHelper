import { defineConfig, devices } from '@playwright/test'

/* The e2e suite (./tests, inventory in COVERAGE.md): the add-on installed into
 * headless Firefox (fixtures.ts), its click handler and the pages it opens, and
 * its pages opened as files with a stubbed `browser` API for what a user does
 * in them.
 *
 *   npx playwright test            # scripts/e2e.sh wraps it
 *
 * The docs tour has its own config (playwright.docs.config.ts). */
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Firefox'],
    viewport: { width: 1280, height: 800 },
    locale: 'en-GB',
    timezoneId: 'Europe/Vienna',
    launchOptions: { env: { ...process.env, LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB:en', LC_ALL: 'en_GB.UTF-8' } },
    trace: 'retain-on-failure',
  },
})
