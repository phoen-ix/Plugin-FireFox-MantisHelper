import { defineConfig, devices } from '@playwright/test'

/* The docs tour (./docs): screenshots of the extension's own pages, and a
 * render check of every page it shows. Playwright cannot load an extension
 * into Firefox, so the tour opens the pages from data/ as files and stubs the
 * `browser` API they use (see docs/tour.spec.ts):
 *
 *   npx playwright test -c playwright.docs.config.ts
 *
 * Screenshots land in ../docs/screenshots (DOCS_SCREENSHOT_DIR overrides).
 * scripts/docs-screenshots.sh wraps it. */
export default defineConfig({
  testDir: './docs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // A retried render check would hide a flaky page.
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Firefox'],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: 'en-GB',
    launchOptions: {
      env: { ...process.env, LANG: 'en_GB.UTF-8', LANGUAGE: 'en_GB:en', LC_ALL: 'en_GB.UTF-8' },
      // The hint page has no styles, so it shows Firefox's default font (serif):
      // the Times New Roman clone, not whatever the host's fontconfig maps serif to.
      firefoxUserPrefs: { 'font.name.serif.x-western': 'Liberation Serif' },
    },
    timezoneId: 'Europe/Vienna',
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'off',
    trace: 'off',
  },
})
