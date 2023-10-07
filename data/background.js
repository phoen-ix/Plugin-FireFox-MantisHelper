browser.runtime.onInstalled.addListener(() => {
  browser.contextMenus.create({
    id: 'openInMantis',
    title: 'Open in Mantis',
    contexts: ['selection']
  });
});

browser.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'openInMantis') {
    let selectedText = info.selectionText;

    // Check if selectedText is defined, not just white spaces, and is a number
    if (selectedText && selectedText.trim() && !isNaN(selectedText.trim())) {
      if (selectedText.startsWith('#')) {
        selectedText = selectedText.substring(1);
      }
      const result = await browser.storage.sync.get(['customUrl']);
      const fixedUrl = result.customUrl || 'https://example.com/view.php?id=';
      const completeUrl = `${fixedUrl}${selectedText}`;
      await browser.tabs.create({ url: completeUrl });
    } else {
      // Open the error page in a new tab
      await browser.tabs.create({ url: browser.runtime.getURL('data/invalid_selection.html') });
    }
  }
});

