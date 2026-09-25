# Mantis Helper — Firefox Extension

## Overview
Mantis Helper is a Firefox extension that adds a context menu option for quickly opening issue numbers in [Mantis](https://www.mantisbt.org/), a popular bug tracking system. It streamlines your workflow by letting you navigate directly to Mantis issues from any webpage where an issue number is displayed.

Get it from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/mantis-helper/).

## Features
- **Context Menu Integration:** Select an issue number on any webpage, right-click, and choose **Open “…” in Mantis**. The menu shows the selected text, and the issue opens in a new tab next to the current one, in the same container and tab group.
- **Finds the Number in the Selection:** `1234`, `#1234`, `0001234` and selections like `Issue #1234:` or `0001234: Fix login bug` all open issue 1234. If the selection contains several numbers, a `#` number wins, then a zero-padded one like Mantis displays them; otherwise the selection is ambiguous and a hint page opens.
- **Simple Configuration:** Enter the address of your Mantis installation (e.g. `https://mantis.example.com/`) and `view.php?id=` is appended automatically. Pasting a Mantis page or issue link works too, and URLs with a query string (e.g. `https://mantis.example.com/view.php?id=`) are used as they are. The options page shows which address an issue number will open.

## Permissions
The extension requires the following permissions:
- **Context Menus** — To add the "Open in Mantis" option to the browser's right-click menu.
- **Storage** — To save the Mantis URL that you set in the options.

**Data collection:** none. Mantis Helper sends nothing to its developer or anyone else. When you choose "Open in Mantis", the selected number is opened as a link on the Mantis server you configured.

## How to Use
1. **Install** the extension from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/mantis-helper/). It requires Firefox 140 or later.
2. **Configure** your Mantis URL: go to the extension options (Settings > Extensions > Mantis Helper > Options) and enter the address of your Mantis installation. If you use "Open in Mantis" before configuring it, the options open automatically.
3. **Use it:** Highlight an issue number (e.g. `1234` or `#1234`) on a webpage, right-click, and select "Open in Mantis".

To use it in private windows, allow "Run in Private Windows" for Mantis Helper in `about:addons`.

## Development
- Lint with the same validator addons.mozilla.org uses: `npx web-ext lint`
- Try it out: open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on…" and select `manifest.json` (or run `npx web-ext run`).
- Package it for upload: `npx web-ext build` (the package is written to `web-ext-artifacts/`).

## Changelog

### v2.0.1
Fixed:
- The "Open in Mantis" menu entry disappeared after every Firefox restart.
- Selecting a `#`-prefixed issue number (e.g. `#123`) opened the error page.
- Values such as `1e3`, `0x1A`, `-5` or `1.5` were accepted as issue numbers.
- Unusable Mantis URLs (e.g. without `https://`) opened broken tabs; the options page now rejects them, and an unconfigured extension opens its options instead of example.com.

Changed:
- Migrated to Manifest V3; requires Firefox 140 or later.
- Declares in the manifest that no data is collected (Firefox's built-in data consent).
- The Mantis URL can be the base address of the installation; URLs without a query string are now treated as such, and `view.php?id=` is appended.
- The issue number is found within the selected text, and the menu shows the selection.
- New tabs open next to the current tab, in its container and tab group.
- The options page previews the resulting address and confirms saving inline instead of with a pop-up.

Version 2.0.0 was an unreleased build.

### v1.2.0.0
- Opens an error page when the selection is not a number.
- Removed the toolbar button.

### v1.1.0.0
- Reorganized the files, added icon sizes, README and license.

### v1.0.0.0
- Initial release (Manifest V2).

## License
See [License.md](License.md).
