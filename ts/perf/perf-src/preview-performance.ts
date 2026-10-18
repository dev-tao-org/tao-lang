import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Try } from '@shared'
import { Artifacts, type BrowserRuntime, Env, FileSystem, Path, Platform, Repo } from '@shared/os'
import type { createWorkspace, Project, UpdateResult } from '@workspace/Workspace'
import { createPreviewHarness, type PreviewHarness } from './PreviewHarness'
import type { ReloadTiming } from './ReloadTimings'

/** previewPerformance measures source edits through two isolated headless Expo web previews.
 *  macOS requires host process access before any browser starts; no screenshots are captured. */
export async function previewPerformance(options: PreviewOptions) {
  if (Platform.systemInfo().os === 'Darwin') {
    await Platform.requireHostProcessAccess('Run ./agent unsandboxed performance preview; Chrome was not launched.')
  }
  const resources: Resources = { errors: [], reloads: [], sessionId: Platform.randomUUID() }
  return await Try(() => measurePreview(options, resources), {
    async finally() {
      await disposePreview(options, resources)
    },
  })
}

/** PreviewOptions supplies a compile session, generated app, and canonical starting Tao source. */
export type PreviewOptions = { workspace: ReturnType<typeof createWorkspace>; project: Project; initialSource: string }

type Resources = {
  sessionId: string
  errors: string[]
  reloads: ReloadTiming[]
  expo?: Runtime.ExpoSession
  startupMs?: number
  frameSizes?: { id: string; width: number; height: number }[]
  harness?: PreviewHarness
  browser?: import('playwright').Browser
}
type PreviewResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: unknown[]
  stages?: unknown
  frames: Record<string, { clickToHmrMs: number; hmrToAppliedMs: number; clickToAppliedMs: number }>
}

const scenarios = ['text', 'add-text', 'row'] as const

async function measurePreview(options: PreviewOptions, owned: Resources) {
  const started = Time.nowMs()
  const sourcePath = Path.join(options.project.directory, '_source/Hello World.tao')
  await FileSystem.mkdir(Path.dirname(sourcePath), { recursive: true })
  await FileSystem.writeFile(sourcePath, options.initialSource, 'utf8')
  requirePublished(await options.workspace.openFile(sourcePath))
  owned.expo = await Runtime.start(options.workspace.runtime!)
  owned.harness = await createPreviewHarness({
    workspace: options.workspace,
    previewUrl: owned.expo.url,
    sessionId: owned.sessionId,
    onReload(timing) {
      owned.reloads.push(timing)
    },
  })
  const { chromium } = await import('playwright')
  owned.browser = await chromium.launch({ headless: true, channel: Env.get('TAO_PREVIEW_BROWSER_CHANNEL') ?? 'chrome' })
  const page = await owned.browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', error => owned.errors.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') {
      owned.errors.push(message.text())
    }
  })
  await page.goto(owned.harness.url)
  await waitForFrameText(page, 'Hello World')
  owned.startupMs = Time.nowMs() - started
  owned.frameSizes = await page.locator('iframe').evaluateAll(frames =>
    frames.map(frame => ({
      id: frame.id,
      width: frame.clientWidth,
      height: frame.clientHeight,
    }))
  )
  const results = await runScenarios(page)
  await waitForReloadReports(owned)
  const path = await writeReport(options.project, owned, results)
  return { path, sessionId: owned.sessionId, results }
}

async function runScenarios(page: import('playwright').Page): Promise<PreviewResult[]> {
  for (const [index, scenario] of scenarios.entries()) {
    await page.locator('#run').click()
    await page.waitForFunction(
      expected => {
        const state = window.__taoPreviewState
        return state?.results.length > expected || state?.status === 'failed'
      },
      index,
      { timeout: 95_000 },
    )
    const state: BrowserRuntime.PageState = await page.evaluate(() => window.__taoPreviewState)
    if (state.status === 'failed') {
      Errors.ThrowUnexpected(state.error ?? 'Preview update failed.')
    }
    await assertScenario(page, scenario)
  }
  return await page.evaluate(() => window.__taoPreviewState.results) as PreviewResult[]
}

async function disposePreview(options: PreviewOptions, owned: Resources): Promise<void> {
  const cleanups: PromiseSettledResult<unknown>[] = await Promise.allSettled([owned.browser?.close()])
  cleanups.push(
    ...await Promise.allSettled([
      Try(() => owned.harness?.dispose()),
      owned.expo?.dispose(),
    ]),
  )
  options.workspace.dispose()
  const output = owned.expo ? await owned.expo.output() : undefined
  const logPath = Artifacts.resolvePath('logs/performance', `preview-${owned.sessionId}.log`)
  await Artifacts.mkdir(Path.dirname(logPath), { recursive: true })
  Artifacts.trackTemporary(logPath)
  await Artifacts.write(logPath, [output?.stdout, output?.stderr, ...owned.errors].filter(Boolean).join('\n'))
  for (const cleanup of cleanups) {
    if (cleanup.status === 'rejected') {
      Errors.Throw(cleanup.reason)
    }
  }
}

async function assertScenario(page: import('playwright').Page, scenario: typeof scenarios[number]): Promise<void> {
  for (const frameId of ['left', 'right']) {
    const frame = page.frameLocator(`#${frameId}`)
    await frame.getByText('Hello Tao', { exact: true }).waitFor()
    if (scenario !== 'text') {
      await frame.getByText('Second view', { exact: true }).waitFor()
    }
    if (scenario === 'row' && !await hasRowLayout(frame)) {
      Errors.ThrowUnexpected(`${frameId} frame did not place both Text children in a Row layout.`)
    }
  }
}

async function hasRowLayout(frame: import('playwright').FrameLocator): Promise<boolean> {
  return await frame.getByText('Hello Tao', { exact: true }).evaluate(first => {
    const parent = first.parentElement
    const second = parent && [...parent.children].find(node => node.textContent === 'Second view')
    return !!second && getComputedStyle(parent!).flexDirection === 'row'
  })
}

async function waitForFrameText(page: import('playwright').Page, text: string): Promise<void> {
  for (const frameId of ['left', 'right']) {
    await page.frameLocator(`#${frameId}`).getByText(text, { exact: true }).waitFor({ timeout: 60_000 })
  }
}

async function writeReport(project: Project, owned: Resources, results: PreviewResult[]): Promise<string> {
  const directory = Artifacts.resolvePath('logs/performance')
  await Artifacts.mkdir(directory, { recursive: true })
  const path = Path.join(directory, `preview-${owned.sessionId}.json`)
  Artifacts.trackTemporary(path)
  await Artifacts.write(
    path,
    JSON.stringify(
      {
        version: 1,
        sessionId: owned.sessionId,
        commit: await Platform.capture('git rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
        modified: await Platform.capture('git status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
        system: Platform.systemInfo(),
        browser: await owned.browser!.version(),
        generatedProject: project.directory,
        startupMs: owned.startupMs,
        frameSizes: owned.frameSizes,
        reloads: owned.reloads,
        definitions: {
          compile: 'In-process parse, AST transform and code generation; typecheck/fix/check explicitly skipped.',
          updateDone: 'Actual Expo Metro client update-done event; React may still have work pending.',
          applied: 'Matching revision acknowledged by a React effect after commit; no physical-paint claim.',
          total: 'Parent click to receipt measured entirely on the parent monotonic clock.',
        },
        results,
      },
      null,
      2,
    ),
  )
  return path
}

function requirePublished(result: UpdateResult): void {
  if (result.status !== 'published') {
    Errors.ThrowUnexpected(`Initial preview source was ${result.status}.`)
  }
}

async function waitForReloadReports(owned: Resources): Promise<void> {
  const deadline = Time.nowMs() + 5000
  while (owned.reloads.length < scenarios.length) {
    if (Time.nowMs() >= deadline) {
      Errors.ThrowUnexpected('Preview receipts did not reach the terminal timing reporter.')
    }
    await Time.sleep(10)
  }
}
