import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { expect, test, type Page } from '@playwright/test'

import { stubBrowser } from '../stub'

/* The docs tour: one screenshot per page of the extension (the gallery is
 * docs/screenshots/README.md). It is also a render check (ci.yml runs it):
 * every test asserts something page-specific before it shoots, and a page
 * that throws fails the test.
 *
 * Playwright cannot load an extension into Firefox, so the pages are opened
 * from data/ as files, and stubBrowser() (../stub.ts) stands in for the WebExtension
 * `browser` API they call. The context menu itself is browser UI that no
 * screenshot can show; the hint page is opened the way the menu opens it,
 * through background.js's click handler. */

// The stub's globals, for page.evaluate().
declare const browser: any
declare const menuClick: (info: object, tab: object) => Promise<void>
declare const createdTabs: { url: string }[]

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const OUT = path.resolve(process.env.DOCS_SCREENSHOT_DIR ?? path.join(ROOT, 'docs/screenshots'))
mkdirSync(OUT, { recursive: true })

const OPTIONS = pathToFileURL(path.join(ROOT, 'data/options.html')).href
const MANTIS_URL = 'https://mantis.example.com/'

let pageErrors: Error[] = []

test.beforeEach(({ page }) => {
  pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e))
})

test.afterEach(() => {
  expect(pageErrors.map((e) => e.message)).toEqual([])
})

async function optionsPage(page: Page, customUrl?: string): Promise<void> {
  await page.addInitScript(stubBrowser, customUrl)
  await page.goto(OPTIONS)
  await expect(page).toHaveTitle('Mantis Helper Options')
}

/** `contentOnly`: only the content, from the top-left corner, instead of
 * the whole viewport - for a page that is mostly empty. `around`: only this
 * element plus a margin - for a page that centres a small card. */
async function shoot(page: Page, name: string, opts: { contentOnly?: boolean; around?: string } = {}): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.move(0, 0)
  let clip: { x: number; y: number; width: number; height: number } | undefined
  if (opts.contentOnly) {
    // The text's own boxes: the block elements span the whole width.
    const { right, bottom } = await page.evaluate(() => {
      const range = document.createRange()
      return [...document.body.children].reduce(
        (box, el) => {
          range.selectNodeContents(el)
          const r = range.getBoundingClientRect()
          return { right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
        },
        { right: 0, bottom: 0 },
      )
    })
    clip = { x: 0, y: 0, width: Math.ceil(right) + 24, height: Math.min(2400, Math.ceil(bottom) + 24) }
  }
  if (opts.around) {
    const box = (await page.locator(opts.around).boundingBox())!
    const m = 32
    clip = { x: box.x - m, y: box.y - m, width: box.width + 2 * m, height: box.height + 2 * m }
  }
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide', clip })
}

test('options: not configured yet', async ({ page }) => {
  await optionsPage(page)
  await expect(page.getByLabel('Mantis URL:')).toHaveValue('')
  await expect(page.locator('#preview')).toHaveText(/^Enter the address of your Mantis installation/)
  await shoot(page, 'options-empty', { around: '#optionsForm' })
})

test('options: unusable URL', async ({ page }) => {
  await optionsPage(page)
  const input = page.getByLabel('Mantis URL:')
  await input.fill('mantis.example.com')
  await expect(page.locator('#preview')).toHaveText(/^Enter the address of your Mantis installation/)
  // What Save checks; a click would also raise the browser's validation
  // bubble, which fades in and out of the shot.
  expect(await input.evaluate((el: HTMLInputElement) => el.form!.checkValidity())).toBe(false)
  await shoot(page, 'options-invalid', { around: '#optionsForm' })
})

test('options: saved', async ({ page }) => {
  await optionsPage(page)
  await page.getByLabel('Mantis URL:').fill(MANTIS_URL)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('#status')).toHaveText('Options saved.')
  await expect(page.getByLabel('Mantis URL:')).toHaveValue(`${MANTIS_URL}view.php?id=`)
  await expect(page.locator('#preview')).toHaveText(`Issue 1234 will open ${MANTIS_URL}view.php?id=1234`)
  expect(await page.evaluate(() => browser.storage.sync.get('customUrl'))).toEqual({
    customUrl: `${MANTIS_URL}view.php?id=`,
  })
  await shoot(page, 'options-saved', { around: '#optionsForm' })
})

/** WCAG contrast ratio of two opaque computed colours, "rgb(r, g, b)". */
function contrast(...colors: string[]): number {
  const [hi, lo] = colors
    .map((color) => {
      const [r, g, b] = color.match(/\d+/g)!.map((v) => {
        const c = Number(v) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    })
    .sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

test('options: contrast, and a window shorter than the form', async ({ page }) => {
  await optionsPage(page)
  const style = (selector: string, prop: string) =>
    page.locator(selector).evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), prop)
  // WCAG AA: 4.5:1 for the button's text, 3:1 for the field's border on the card.
  expect(contrast(await style('button', 'color'), await style('button', 'background-color'))).toBeGreaterThanOrEqual(4.5)
  expect(
    contrast(await style('#customUrl', 'border-top-color'), await style('#optionsForm', 'background-color')),
  ).toBeGreaterThanOrEqual(3)
  // The page scrolls; it does not cut off the top of the form.
  await page.setViewportSize({ width: 1280, height: 200 })
  await page.evaluate(() => window.scrollTo(0, 0))
  expect((await page.locator('#optionsForm').boundingBox())!.y).toBeGreaterThanOrEqual(0)
})

test('context menu: no single issue number in the selection', async ({ page }) => {
  await optionsPage(page, `${MANTIS_URL}view.php?id=`)
  await page.addScriptTag({ path: path.join(ROOT, 'data/background.js') })
  // What a click on "Open “Issues 12 and 34” in Mantis" does.
  const tabs = await page.evaluate(async () => {
    await menuClick({ menuItemId: 'openInMantis', selectionText: 'Issues 12 and 34' }, { id: 1, windowId: 1 })
    return createdTabs
  })
  const hint = new URL('invalid_selection.html', OPTIONS).href
  expect(tabs).toEqual([{ url: hint, windowId: 1, openerTabId: 1 }])
  await page.goto(hint)
  await expect(page.getByRole('heading', { name: 'Invalid selection' })).toBeVisible()
  await shoot(page, 'menu-invalid-selection', { contentOnly: true })
})
