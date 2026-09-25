const MENU_ID = 'openInMantis';

// Firefox keeps the menu of an event page across restarts, but onInstalled also
// fires after browser updates, so start clean to avoid a duplicate menu id.
browser.runtime.onInstalled.addListener(async () => {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: MENU_ID,
    title: 'Open “%s” in Mantis',
    contexts: ['selection']
  });
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const { customUrl } = await browser.storage.sync.get('customUrl');
  const urlPrefix = normalizeMantisUrl(customUrl);
  if (!urlPrefix) {
    // Not configured yet, or configured with an unusable URL
    await browser.runtime.openOptionsPage();
    return;
  }

  const issueId = findIssueId(info.selectionText);
  const url = issueId ? `${urlPrefix}${issueId}` : browser.runtime.getURL('data/invalid_selection.html');
  const placement = await besideTab(tab);
  await browser.tabs.create({ url, ...placement });
});

// Opens the new tab next to the one the menu was used in, which also keeps its
// container and tab group. Popup windows have no tab strip, so they are skipped.
async function besideTab(tab) {
  if (!tab) {
    return {};
  }
  const sourceWindow = await browser.windows.get(tab.windowId);
  return sourceWindow.type === 'normal' ? { windowId: tab.windowId, openerTabId: tab.id } : {};
}
