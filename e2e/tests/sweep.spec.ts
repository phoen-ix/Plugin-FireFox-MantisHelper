import { expect, test } from '../fixtures'

/* Every page of the add-on (data/*.html) in every state of its settings:
 * a visible heading and no error. As pages of the installed add-on (opened in a
 * tab, errors from the add-on's pages fail the test) and as files with a
 * stubbed `browser` API (a page error fails the test). */

const PAGES = [
  ['options.html', 'Mantis Helper Options'],
  ['invalid_selection.html', 'Invalid selection'],
] as const

const STATES = [
  ['not configured', undefined],
  ['configured', 'https://mantis.example.com/view.php?id='],
  ['the v1.x placeholder', 'https://example.com/view.php?id='],
] as const

for (const [file, heading] of PAGES) {
  for (const [state, customUrl] of STATES) {
    test(`${file}, ${state}: installed add-on`, async ({ addon }) => {
      if (customUrl) await addon.background.evaluate((customUrl) => browser.storage.sync.set({ customUrl }), customUrl)
      const url = addon.url(`data/${file}`)
      await addon.background.evaluate((url) => browser.windows.create({ url }), url)
      const page = await addon.page(url)
      expect(await page.evaluate(() => document.querySelector('h1')!.textContent)).toBe(heading)
    })

    test(`${file}, ${state}: as a file`, async ({ stubbedPage }) => {
      const page = await stubbedPage(file, customUrl)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    })
  }
}
