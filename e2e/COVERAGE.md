# E2E coverage

Inventory of what Mantis Helper does for a user, each mapped to the test that drives it
(`spec › test title`, specs in `e2e/tests/`) or to the reason it is not driven here.
Run the suite with `scripts/e2e.sh`.

Extraction (2026-10-31, 24 items: manifest pages, scripts and permissions, the pages in `data/`,
every listener and `browser.*` call):

```bash
node -e 'const m=require("./manifest.json");console.log(["options_ui: "+m.options_ui.page,...m.background.scripts.map(s=>"background: "+s),...m.permissions.map(p=>"permission: "+p)].join("\n"))'
ls data/*.html
grep -noE "browser\.[a-zA-Z.]+(\.addListener)?\(|addEventListener\('[A-Za-z]+'|function [a-zA-Z]+" data/background.js data/options.js
```

The add-on has no accounts and no roles; its states are the stored Mantis URL: not configured,
configured, the v1.x placeholder (`https://example.com/view.php?id=`, treated as not configured)
and an unusable URL. It has one language (English) and no dark styles.

Two layers: **installed** = the add-on loaded into Firefox as a temporary add-on
(`fixtures.ts`; real storage, tabs, windows, containers, the real click handler, errors from any
of its pages fail the test); **file** = a page from `data/` opened as a file with a stubbed
`browser` API (`stub.ts`), where Playwright can type and click.

Item → rows: `options_ui`, `options.html`, `storage`, `options.js` (`update`, `DOMContentLoaded`,
`input`, `submit`, `storage.sync.get/set`) → "Options page"; `invalid_selection.html` → "Pages";
`mantis.js`, `background.js` → "Background page"; `contextMenus`, `onInstalled`, `removeAll`,
`create` → "Context menu" (first four rows); `onClicked` (also the first row), `handleMenuClick`, `storage.sync.get`,
`openOptionsPage`, `getURL`, `tabs.create`, `besideTab`, `windows.get` → "Context menu" (the rest).

Totals: **28 rows: ✅ 22, ❌ 6** — (c) 2, (d) 3, (e) 1.

## Pages (sweep)

| Item | State | Test |
|---|---|---|
| `data/options.html` (options_ui) | not configured, configured, v1.x placeholder | ✅ `sweep.spec.ts › options.html, <state>: installed add-on` and `… : as a file` (6) |
| `data/invalid_selection.html` (hint) | not configured, configured, v1.x placeholder | ✅ `sweep.spec.ts › invalid_selection.html, <state>: installed add-on` and `… : as a file` (6) |
| Background page (`mantis.js` + `background.js`) loads without errors | installed | ✅ every installed test (fixture: errors from the add-on's pages fail the test) |

## Context menu (`background.js`)

| Item | Test |
|---|---|
| Installed add-on: the menu id `openInMantis` exists, `contextMenus.onClicked` → `handleMenuClick` | ✅ `menu.spec.ts › the menu is registered when the add-on is installed` |
| `runtime.onInstalled` → `contextMenus.removeAll`, then `create` `{id: 'openInMantis', title: 'Open “%s” in Mantis', contexts: ['selection']}`, each time it fires (file layer, recorded calls) | ✅ `menu.spec.ts › onInstalled clears the menus, then creates “Open “%s” in Mantis” for selections, every time` |
| The entry in Firefox's context menu as the browser draws it, the selection in its title | ❌ (d) browser UI: Playwright cannot open Firefox's context menu. What the add-on asks for is the row above; the handler it calls is driven below. |
| Firefox itself firing `onInstalled` after a browser update | ❌ (d) Firefox fires it with reason `browser_update` only on a real browser update; reinstalling a temporary add-on unloads its menus first. The handler's response to a second firing is the `onInstalled` row above. |
| Selection with one issue number → issue opens next to its tab, same container (`1234`, `#1234`, `0001234`, `Issue #1234: Fix login bug`, `0001234: Fix login bug`, `See #1234 and 56.`) | ✅ `menu.spec.ts › a configured add-on › “<selection>” opens issue 1234 next to its tab, in its container` (6) |
| Selection without a single number → hint page next to its tab (`Issues 12 and 34`, `Fix login bug`, `1e3`) | ✅ `menu.spec.ts › a configured add-on › “<selection>” opens the invalid-selection hint next to its tab` (3) |
| Every rule of finding the number (precedence `#` > zero-padded > plain, ambiguity, `0x1A`, `-5`, `1.5`, 11 digits …) | ❌ (c) `tests/mantis.test.mjs › findIssueId: …` (`npm test`, CI job `lint`); the e2e rows above drive a sample through the handler |
| Same tab group | ✅ `menu.spec.ts › a configured add-on › a tab in a tab group opens the issue in the same group` |
| Popup window (no tab strip) → tab of a normal window | ✅ `menu.spec.ts › a configured add-on › a popup window opens the issue as a tab of a normal window` |
| No tab (e.g. a sidebar) → new tab | ✅ `menu.spec.ts › a configured add-on › a selection outside of a tab opens the issue in a new tab` |
| Another menu item → ignored | ✅ `menu.spec.ts › a configured add-on › another menu item of the browser is ignored` |
| Not configured → options open instead | ✅ `menu.spec.ts › not configured yet: the menu opens the options instead` |
| v1.x placeholder → options open instead, field empty | ✅ `menu.spec.ts › configured with the v1.x placeholder: the menu opens the options instead` |
| Unusable stored URL → options open instead, the URL shown for correction | ✅ `menu.spec.ts › configured with an unusable URL: the menu opens the options instead` |
| Private windows (README: "Run in Private Windows") | ❌ (e) TODO, about 30 min: grant `internal:privateBrowsingAllowed` to the temporary add-on through the parent process over the debugging protocol, then reload it; a test without it fails with "Extension does not have permission for incognito mode" |

## Options page (`options.html`, `options.js`)

| Item | Test |
|---|---|
| A saved URL is shown, with its preview | ✅ `options.spec.ts › a saved URL is shown when the options open` |
| Not configured / v1.x placeholder → empty field and the hint | ✅ `options.spec.ts › not configured yet: an empty field and the hint`, `› the v1.x placeholder: an empty field and the hint` |
| Live preview and Save: base address, page link, issue link, sub-path, URL with a query | ✅ `options.spec.ts › typing <url> previews <prefix>1234, and Save stores that` (5) |
| Unusable URL (no scheme, `ftp:`, the placeholder) → hint, validation message, not saved | ✅ `options.spec.ts › <url> is rejected and not saved` (3) |
| Empty field → required, nothing saved | ✅ `options.spec.ts › an empty field is required, and Save stores nothing` |
| Enter saves; typing again clears "Options saved." | ✅ `options.spec.ts › Enter saves, and typing again clears the confirmation` |
| Save in the installed add-on's options tab → `storage.sync` → the menu uses it | ✅ `menu.spec.ts › configure the options, then open a selected issue` |
| Opened from `about:addons` > Mantis Helper > Options | ❌ (d) about:addons is a privileged browser page Playwright cannot drive; `runtime.openOptionsPage()` (the same page in a tab) is driven by the "opens the options instead" rows |
| Contrast (WCAG AA) and a window shorter than the form | ✅ `docs/tour.spec.ts › options: contrast, and a window shorter than the form` (docs tour, CI job `docs-tour`) |

## Package

| Item | Test |
|---|---|
| Manifest (Firefox 142+, permissions, data collection: none) valid for addons.mozilla.org | ❌ (c) `npm run lint` (`web-ext lint --warnings-as-errors`, CI job `lint`) |
