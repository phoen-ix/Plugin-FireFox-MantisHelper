import { MANTIS, expect, test } from '../fixtures'

/* The options page (data/options.html): what a user sees, types and clicks.
 * The page is opened as a file with a stubbed `browser.storage` (stub.ts);
 * menu.spec.ts saves through the real page of the installed add-on. */

const HINT = /^Enter the address of your Mantis installation/

test('a saved URL is shown when the options open', async ({ stubbedPage }) => {
  const page = await stubbedPage('options.html', 'https://bugs.example.com/show_bug.php?bug_id=')
  await expect(page.getByLabel('Mantis URL:')).toHaveValue('https://bugs.example.com/show_bug.php?bug_id=')
  await expect(page.locator('#preview')).toHaveText('Issue 1234 will open https://bugs.example.com/show_bug.php?bug_id=1234')
})

for (const [state, stored] of [
  ['not configured yet', undefined],
  ['the v1.x placeholder', 'https://example.com/view.php?id='],
] as const) {
  test(`${state}: an empty field and the hint`, async ({ stubbedPage }) => {
    const page = await stubbedPage('options.html', stored)
    await expect(page.getByLabel('Mantis URL:')).toHaveValue('')
    await expect(page.locator('#preview')).toHaveText(HINT)
  })
}

for (const [typed, prefix] of [
  ['https://mantis.example.com', `${MANTIS}view.php?id=`],
  ['https://mantis.example.com/my_view_page.php', `${MANTIS}view.php?id=`],
  ['https://mantis.example.com/view.php?id=4711', `${MANTIS}view.php?id=`],
  ['http://intranet.example.com/mantis/', 'http://intranet.example.com/mantis/view.php?id='],
  ['https://bugs.example.com/show?p=issue&key=', 'https://bugs.example.com/show?p=issue&key='],
]) {
  test(`typing ${typed} previews ${prefix}1234, and Save stores that`, async ({ stubbedPage }) => {
    const page = await stubbedPage('options.html')
    await page.getByLabel('Mantis URL:').fill(typed)
    await expect(page.locator('#preview')).toHaveText(`Issue 1234 will open ${prefix}1234`)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Options saved.')
    await expect(page.getByLabel('Mantis URL:')).toHaveValue(prefix)
    expect(await page.evaluate(() => browser.storage.sync.get('customUrl'))).toEqual({ customUrl: prefix })
  })
}

for (const typed of ['mantis.example.com', 'ftp://mantis.example.com/', 'https://example.com/view.php?id=']) {
  test(`${typed} is rejected and not saved`, async ({ stubbedPage }) => {
    const page = await stubbedPage('options.html')
    const input = page.getByLabel('Mantis URL:')
    await input.fill(typed)
    await expect(page.locator('#preview')).toHaveText(HINT)
    expect(await input.evaluate((el: HTMLInputElement) => el.validationMessage)).toMatch(HINT)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(input).toHaveValue(typed)
    await expect(page.getByRole('status')).toHaveText('')
    expect(await page.evaluate(() => browser.storage.sync.get('customUrl'))).toEqual({})
  })
}

test('an empty field is required, and Save stores nothing', async ({ stubbedPage }) => {
  const page = await stubbedPage('options.html')
  const input = page.getByLabel('Mantis URL:')
  await page.getByRole('button', { name: 'Save' }).click()
  expect(await input.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true)
  await expect(page.getByRole('status')).toHaveText('')
  expect(await page.evaluate(() => browser.storage.sync.get('customUrl'))).toEqual({})
})

test('Enter saves, and typing again clears the confirmation', async ({ stubbedPage }) => {
  const page = await stubbedPage('options.html')
  const input = page.getByLabel('Mantis URL:')
  await input.fill(MANTIS)
  await input.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Options saved.')
  await input.press('End')
  await input.pressSequentially('x')
  await expect(page.getByRole('status')).toHaveText('')
  await expect(page.locator('#preview')).toHaveText(`Issue 1234 will open ${MANTIS}view.php?id=x1234`)
})

test('what is typed before the saved URL has loaded is kept, and Save saves it', async ({ stubbedPage }) => {
  // Storage answers late, after the user has started typing (seen in CI).
  const page = await stubbedPage('options.html', undefined, 500)
  await page.getByLabel('Mantis URL:').fill(MANTIS)
  await page.waitForFunction(() => (window as any).storageReads > 0)
  await expect(page.getByLabel('Mantis URL:')).toHaveValue(MANTIS)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('#status')).toHaveText('Options saved.')
})
