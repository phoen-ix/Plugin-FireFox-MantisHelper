import { MANTIS, SOURCE, clickMenu, expect, newTabs, sourcePage, storeUrl, test } from '../fixtures'

/* The context menu "Open “<selection>” in Mantis" of the installed add-on: what
 * its click handler (background.js) opens for a selection, and where. Firefox's
 * menu itself is browser UI that cannot be driven, so each test calls the
 * handler the way Firefox does, with the selected text of a real page and that
 * page's tab. */

const ISSUE = `${MANTIS}view.php?id=1234`

test('the menu is registered when the add-on is installed', async ({ addon }) => {
  // update() fails for a menu id that does not exist.
  await expect(addon.background.evaluate(() => browser.contextMenus.update('noSuchMenu', {}))).rejects.toThrow()
  await addon.background.evaluate(() => browser.contextMenus.update('openInMantis', {}))
})

test.describe('a configured add-on', () => {
  test.beforeEach(async ({ addon }) => {
    await storeUrl(addon, `${MANTIS}view.php?id=`)
  })

  for (const selection of ['1234', '#1234', '0001234', 'Issue #1234: Fix login bug', '0001234: Fix login bug', 'See #1234 and 56.']) {
    test(`“${selection}” opens issue 1234 next to its tab, in its container`, async ({ addon, context }) => {
      const { tab, selectionText } = await sourcePage(addon, context, selection)
      // Playwright's browser contexts are Firefox containers.
      expect(tab.cookieStoreId).not.toBe('firefox-default')
      const opened = context.waitForEvent('page')
      const [issue] = await newTabs(addon, () => clickMenu(addon, selectionText, tab))
      expect(issue).toMatchObject({ windowId: tab.windowId, index: tab.index + 1, openerTabId: tab.id, cookieStoreId: tab.cookieStoreId })
      await expect(await opened).toHaveURL(ISSUE)
    })
  }

  for (const selection of ['Issues 12 and 34', 'Fix login bug', '1e3']) {
    test(`“${selection}” opens the invalid-selection hint next to its tab`, async ({ addon, context }) => {
      const { tab, selectionText } = await sourcePage(addon, context, selection)
      const [hint] = await newTabs(addon, () => clickMenu(addon, selectionText, tab))
      expect(hint).toMatchObject({ windowId: tab.windowId, index: tab.index + 1, openerTabId: tab.id })
      const page = await addon.page(addon.url('data/invalid_selection.html'))
      expect(await page.evaluate(() => document.querySelector('h1')!.textContent)).toBe('Invalid selection')
    })
  }

  test('a tab in a tab group opens the issue in the same group', async ({ addon, context }) => {
    const { tab, selectionText } = await sourcePage(addon, context)
    const groupId = await addon.background.evaluate((tabIds) => browser.tabs.group({ tabIds }), tab.id)
    const [issue] = await newTabs(addon, () => clickMenu(addon, selectionText, { ...tab, groupId }))
    expect(issue).toMatchObject({ groupId, index: tab.index + 1 })
  })

  // Without the "cookies" permission tabs.create cannot pick a container, so this
  // tab is in the default container (no route here: it shows an error page).
  test('a popup window opens the issue as a tab of a normal window', async ({ addon, context }) => {
    const { page } = await sourcePage(addon, context)
    const [popupTab] = await newTabs(addon, () =>
      Promise.all([context.waitForEvent('page'), page.evaluate((url) => window.open(url, '', 'popup,width=400,height=300'), SOURCE)]),
    )
    expect(await addon.background.evaluate((id) => browser.windows.get(id), popupTab.windowId)).toMatchObject({ type: 'popup' })
    const [issue] = await newTabs(addon, () => clickMenu(addon, '#1234', popupTab))
    expect(issue.windowId).not.toBe(popupTab.windowId)
    expect(await addon.background.evaluate((id) => browser.windows.get(id), issue.windowId)).toMatchObject({ type: 'normal' })
    await expect.poll(() => addon.tabUrls()).toContain(ISSUE)
  })

  // E.g. a selection in a sidebar: Firefox passes no tab.
  test('a selection outside of a tab opens the issue in a new tab', async ({ addon, context }) => {
    await sourcePage(addon, context)
    const opened = await newTabs(addon, () => clickMenu(addon, '#1234', undefined))
    expect(opened).toHaveLength(1)
    expect(await addon.background.evaluate((id) => browser.windows.get(id), opened[0].windowId)).toMatchObject({ type: 'normal' })
    await expect.poll(() => addon.tabUrls()).toContain(ISSUE)
  })

  test('another menu item of the browser is ignored', async ({ addon, context }) => {
    const { tab } = await sourcePage(addon, context)
    expect(await newTabs(addon, () => clickMenu(addon, '1234', tab, 'someOtherMenu'))).toEqual([])
  })
})

for (const [state, url] of [
  ['not configured yet', undefined],
  ['configured with the v1.x placeholder', 'https://example.com/view.php?id='],
  ['configured with an unusable URL', 'mantis.example.com'],
] as const) {
  test(`${state}: the menu opens the options instead`, async ({ addon, context }) => {
    await storeUrl(addon, url)
    const { tab, selectionText } = await sourcePage(addon, context)
    expect(await newTabs(addon, () => clickMenu(addon, selectionText, tab))).toHaveLength(1)
    const options = await addon.page(addon.url('data/options.html'))
    expect(await options.evaluate(() => document.querySelector('h1')!.textContent)).toBe('Mantis Helper Options')
    // The placeholder counts as not configured; an unusable URL stays, to be corrected.
    expect(await options.evaluate(() => (document.getElementById('customUrl') as HTMLInputElement).value)).toBe(
      url === 'mantis.example.com' ? url : '',
    )
  })
}

test('configure the options, then open a selected issue', async ({ addon, context }) => {
  const { tab, selectionText } = await sourcePage(addon, context, 'Reported as #4711 yesterday')
  await clickMenu(addon, selectionText, tab)
  const options = await addon.page(addon.url('data/options.html'))
  // What typing the address and pressing Save does in the options tab.
  await options.evaluate((url) => {
    const input = document.getElementById('customUrl') as HTMLInputElement
    input.value = url
    input.dispatchEvent(new Event('input'))
    input.form!.requestSubmit()
  }, 'https://bugs.example.com/show_bug.php?bug_id=')
  await expect.poll(() => options.evaluate(() => document.getElementById('status')!.textContent)).toBe('Options saved.')
  expect(await addon.background.evaluate(() => browser.storage.sync.get('customUrl'))).toEqual({
    customUrl: 'https://bugs.example.com/show_bug.php?bug_id=',
  })
  const opened = context.waitForEvent('page')
  await clickMenu(addon, selectionText, tab)
  await expect(await opened).toHaveURL('https://bugs.example.com/show_bug.php?bug_id=4711')
})
