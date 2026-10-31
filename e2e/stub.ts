/** The part of the WebExtension `browser` API that the pages in data/ use, for
 * opening them as files: storage with `customUrl` stored (undefined: never
 * configured), the menu's click handler as `menuClick(info, tab)`, the
 * onInstalled listener as `installed()`, the contextMenus calls it makes in
 * `menuCalls` and the tabs the click handler creates in `createdTabs`. Runs in
 * the page, before its scripts (page.addInitScript). */
export function stubBrowser(customUrl?: string) {
  const store: Record<string, unknown> = customUrl === undefined ? {} : { customUrl }
  const listeners: Record<string, (...args: any[]) => unknown> = {}
  const event = (name: string) => ({ addListener: (fn: (...args: any[]) => unknown) => (listeners[name] = fn) })
  const w = window as any
  w.createdTabs = []
  w.menuCalls = []
  w.installed = () => listeners.installed()
  w.menuClick = (info: object, tab: object) => listeners.menuClicked(info, tab)
  w.browser = {
    storage: {
      sync: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: object) => void Object.assign(store, items),
      },
    },
    runtime: {
      onInstalled: event('installed'),
      getURL: (p: string) => new URL(`../${p}`, location.href).href,
    },
    contextMenus: {
      onClicked: event('menuClicked'),
      removeAll: async () => void w.menuCalls.push(['removeAll']),
      create: (props: object) => void w.menuCalls.push(['create', props]),
    },
    windows: { get: async () => ({ type: 'normal' }) },
    tabs: { create: async (props: { url: string }) => void w.createdTabs.push(props) },
  }
}

/** Storage reads that answer `ms` late, with the value from when they were
 * made, as a busy browser does; `storageReads` counts the answered ones. Runs
 * after stubBrowser (page.addInitScript, in that order). */
export function slowStorageReads(ms: number) {
  const w = window as any
  const sync = w.browser.storage.sync
  const get = sync.get
  w.storageReads = 0
  sync.get = (key: string) =>
    get(key).then((value: object) => new Promise((resolve) => setTimeout(() => (w.storageReads++, resolve(value)), ms)))
}
