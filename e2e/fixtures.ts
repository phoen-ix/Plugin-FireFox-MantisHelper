import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { test as base, expect, firefox, type Browser, type BrowserContext, type Page } from '@playwright/test'

import { slowStorageReads, stubBrowser } from './stub'

/* Fixtures of the e2e suite (tests/).
 *
 * `addon`: Playwright cannot load an extension into Firefox, so each worker
 * starts Firefox with its remote debugging server on a Unix socket and installs
 * the add-on over that protocol as a temporary add-on, the way `web-ext run`
 * and about:debugging do. The same connection runs code in the add-on's pages:
 * the background page (browser.* calls, the menu's click handler) and the
 * options and hint pages the add-on opens, which Playwright cannot drive. An
 * error in any of them fails the test. Every test gets a fresh browser context
 * (in Firefox: a container) and empty storage. Fake sites on *.example.com are
 * served by routes, so nothing reaches the network.
 *
 * `stubbedPage`: the add-on's pages opened from data/ as files, with a stub of
 * the `browser` API (stub.ts), for what a user types and clicks in them. */

export const MANTIS = 'https://mantis.example.com/'
export const SOURCE = 'https://intranet.example.com/notes'
export const ROOT = fileURLToPath(new URL('..', import.meta.url))

const ADDON_ID = 'mantis-helper@monumental.at'

type Packet = Record<string, any>

/** Firefox's remote debugging protocol: JSON packets, each prefixed with its length and ":". */
class Rdp {
  private buffer = Buffer.alloc(0)
  private backlog: Packet[] = []
  private waiting: { match: (p: Packet) => boolean; resolve: (p: Packet) => void }[] = []
  readonly events: Packet[] = []

  constructor(private socket: net.Socket) {
    socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data])
      for (let colon; (colon = this.buffer.indexOf(':')) >= 0; ) {
        const end = colon + 1 + Number(this.buffer.subarray(0, colon).toString())
        if (this.buffer.length < end) break
        this.dispatch(JSON.parse(this.buffer.subarray(colon + 1, end).toString()))
        this.buffer = this.buffer.subarray(end)
      }
    })
  }

  private dispatch(packet: Packet): void {
    if (packet.type) this.events.push(packet)
    const i = this.waiting.findIndex((w) => w.match(packet))
    if (i >= 0) this.waiting.splice(i, 1)[0].resolve(packet)
    else if (!packet.type) this.backlog.push(packet)
  }

  /** The next packet that `match`es, or the latest one that has arrived already. */
  next(match: (p: Packet) => boolean): Promise<Packet> {
    const i = this.backlog.findIndex(match)
    if (i >= 0) return Promise.resolve(this.backlog.splice(i, 1)[0])
    const found = this.events.findLast(match)
    if (found) return Promise.resolve(found)
    return new Promise((resolve) => this.waiting.push({ match, resolve }))
  }

  /** Sends a request and returns the actor's reply (a packet without a `type`). */
  async request(packet: Packet): Promise<Packet> {
    const reply = this.next((p) => p.from === packet.to && (!p.type || p.error))
    const json = JSON.stringify(packet)
    this.socket.write(`${Buffer.byteLength(json)}:${json}`)
    const p = await reply
    if (p.error) throw new Error(`${packet.type}: ${p.error}: ${p.message}`)
    return p
  }

  /** Runs `fn(arg)` in a page of the add-on and returns its (JSON) result. */
  async evaluate<A, R>(consoleActor: string, fn: (arg: A) => R, arg?: A): Promise<Awaited<R>> {
    // A rejected promise would come back as a plain result (and be logged as an error).
    const text = `(async () => {
      try { return JSON.stringify({ value: await (${fn})(${JSON.stringify(arg)}) }) }
      catch (e) { return JSON.stringify({ error: String(e) }) }
    })()`
    const { resultID } = await this.request({ to: consoleActor, type: 'evaluateJSAsync', text, mapped: { await: true } })
    const result = await this.next((p) => p.type === 'evaluationResult' && p.resultID === resultID)
    if (result.hasException) throw new Error(result.exceptionMessage)
    const { value, error } = JSON.parse(result.result)
    if (error) throw new Error(error)
    return value
  }
}

/** A page of the add-on: its URL, and `evaluate` to run code in it. */
export type AddonPage = { url: string; evaluate<A, R>(fn: (arg: A) => R, arg?: A): Promise<Awaited<R>> }

export type Addon = {
  /** moz-extension:// URL of a file of the add-on. */
  url(file: string): string
  background: AddonPage
  /** The add-on's page at `url`, once it has loaded. */
  page(url: string): Promise<AddonPage>
  /** URLs of all tabs of the browser. A fake site outside the test's context
   * (another container) has no route: its tab has the address of its error page. */
  tabUrls(): Promise<string[]>
  /** Errors logged by the add-on's pages. */
  errors(): string[]
}

type WorkerFixtures = { addonBrowser: { browser: Browser; addon: Addon } }

export const test = base.extend<{ addon: Addon; context: BrowserContext; stubbedPage: (file: string, customUrl?: string, loadDelayMs?: number) => Promise<Page> }, WorkerFixtures>({
  addonBrowser: [
    async ({ launchOptions }, use) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'mantis-helper-e2e-'))
      // What ships (package.json webExt.ignoreFiles), not the checkout with e2e/node_modules.
      const addonDir = path.join(dir, 'addon')
      for (const p of ['manifest.json', 'data', 'icons']) cpSync(path.join(ROOT, p), path.join(addonDir, p), { recursive: true })
      const socketPath = path.join(dir, 'rdp.sock')
      const browser = await firefox.launch({
        ...launchOptions,
        args: ['-start-debugger-server', socketPath],
        firefoxUserPrefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.debugger.prompt-connection': false,
          // The event page must not unload between a test's calls into it.
          'extensions.background.idle.timeout': 3_600_000,
        },
      })
      await expect.poll(() => existsSync(socketPath)).toBe(true)
      const socket = net.connect({ path: socketPath })
      const rdp = new Rdp(socket)
      await rdp.next((p) => p.applicationType === 'browser')
      const { addonsActor } = await rdp.request({ to: 'root', type: 'getRoot' })
      await rdp.request({ to: addonsActor, type: 'installTemporaryAddon', addonPath: addonDir })
      const { addons } = await rdp.request({ to: 'root', type: 'listAddons' })
      const descriptor = addons.find((a: Packet) => a.id === ADDON_ID)
      const base = new URL('.', descriptor.manifestURL).href
      // All pages of the add-on (target-available-form events) and their errors.
      const watcher = await rdp.request({ to: descriptor.actor, type: 'getWatcher', isServerTargetSwitchingEnabled: true })
      await rdp.request({ to: watcher.actor, type: 'watchTargets', targetType: 'frame' })
      await rdp.request({ to: watcher.actor, type: 'watchResources', resourceTypes: ['error-message', 'console-message'] })

      // A page with that URL from an earlier test may not have reported its unload yet.
      const used = new Set<string>()
      const page = async (url: string): Promise<AddonPage> => {
        const closed = (actor: string) => rdp.events.some((p) => p.type === 'target-destroyed-form' && p.target.actor === actor)
        const target = await rdp.next(
          (p) => p.type === 'target-available-form' && p.target.url === url && !used.has(p.target.actor) && !closed(p.target.actor),
        )
        used.add(target.target.actor)
        const page = { url, evaluate: <A, R>(fn: (arg: A) => R, arg?: A) => rdp.evaluate(target.target.consoleActor, fn, arg) }
        await expect.poll(() => page.evaluate(() => document.readyState)).toBe('complete')
        return page
      }
      const background = await page(`${base}_generated_background_page.html`)
      const addon: Addon = {
        url: (file) => new URL(file, base).href,
        background,
        page,
        tabUrls: async () =>
          (await rdp.request({ to: 'root', type: 'listTabs' })).tabs.map((t: Packet) =>
            t.url.startsWith('about:neterror') ? new URL(t.url).searchParams.get('u') : t.url,
          ),
        errors: () =>
          rdp.events
            .filter((p) => p.type === 'resources-available-array')
            .flatMap((p) => p.array.flatMap(([, resources]: [string, Packet[]]) => resources))
            .filter((r) => (r.pageError && !r.pageError.warning) || r.level === 'error')
            .map((r) => r.pageError?.errorMessage ?? r.arguments.join(' ')),
      }
      await use({ browser, addon })
      socket.destroy()
      await browser.close()
      rmSync(dir, { recursive: true, force: true })
    },
    { scope: 'worker' },
  ],

  addon: async ({ addonBrowser: { addon } }, use) => {
    await addon.background.evaluate(() => browser.storage.sync.clear())
    const tabsBefore = await addon.background.evaluate(() => browser.tabs.query({}).then((tabs) => tabs.map((t) => t.id)))
    const errorsBefore = addon.errors().length
    await use(addon)
    // Tabs the add-on opened outside the test's context (its options page, popups' tabs).
    await addon.background.evaluate(async (keep) => {
      const tabs = await browser.tabs.query({})
      await browser.tabs.remove(tabs.map((t) => t.id!).filter((id) => !keep.includes(id)))
    }, tabsBefore)
    expect(addon.errors().slice(errorsBefore), 'errors in the add-on').toEqual([])
  },

  context: async ({ addonBrowser: { browser }, addon, viewport, locale, timezoneId }, use) => {
    const context = await browser.newContext({ viewport, locale, timezoneId })
    const errors: string[] = []
    context.on('weberror', (e) => errors.push(e.error().message))
    await context.route(/^https:\/\/[^/]*\.example\.com\//, (route) =>
      route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><title>${route.request().url()}</title><h1>Mantis issue</h1>` }),
    )
    await use(context)
    await context.close()
    expect(errors, 'page errors').toEqual([])
  },

  stubbedPage: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await use(async (file, customUrl, loadDelayMs) => {
      await page.addInitScript(stubBrowser, customUrl)
      if (loadDelayMs) await page.addInitScript(slowStorageReads, loadDelayMs)
      await page.goto(pathToFileURL(path.join(ROOT, 'data', file)).href)
      return page
    })
    expect(errors, 'page errors').toEqual([])
  },
})

export { expect }

// The add-on's API, in addon.background/page(...).evaluate().
declare global {
  const browser: any
  function handleMenuClick(info: object, tab: unknown): Promise<void>
}

/** The tabs (browser.tabs.Tab) that `action` opens. */
export async function newTabs(addon: Addon, action: () => Promise<unknown>): Promise<any[]> {
  const ids = () => addon.background.evaluate(() => browser.tabs.query({}).then((tabs: any[]) => tabs.map((t) => t.id)))
  const before = await ids()
  await action()
  return addon.background.evaluate(
    (before) => browser.tabs.query({}).then((tabs: any[]) => tabs.filter((t) => !before.includes(t.id))),
    before,
  )
}

/** A page of a fake intranet site in a tab of `context`, with `selection` selected; its tab and the selected text. */
export async function sourcePage(addon: Addon, context: BrowserContext, selection = 'Issue #1234: Fix login bug') {
  let page!: Page
  const [tab] = await newTabs(addon, async () => {
    page = await context.newPage()
  })
  await page.route(SOURCE, (route) =>
    route.fulfill({ contentType: 'text/html', body: `<!DOCTYPE html><title>Notes</title><p>${selection}</p>` }),
  )
  await page.goto(SOURCE)
  await page.getByText(selection).selectText()
  return { page, tab, selectionText: await page.evaluate(() => getSelection()!.toString()) }
}

/** What a click on "Open “<selection>” in Mantis" in `tab` does: the
 * background page's onClicked handler, called with what Firefox passes it. */
export function clickMenu(addon: Addon, selectionText: string, tab: unknown, menuItemId = 'openInMantis'): Promise<void> {
  return addon.background.evaluate(({ info, tab }) => handleMenuClick(info, tab), { info: { menuItemId, selectionText }, tab })
}

/** Stores `customUrl` as the options page would (undefined: never configured). */
export function storeUrl(addon: Addon, customUrl?: string): Promise<void> {
  return addon.background.evaluate((customUrl) => (customUrl === undefined ? browser.storage.sync.clear() : browser.storage.sync.set({ customUrl })), customUrl)
}
