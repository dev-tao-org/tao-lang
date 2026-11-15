import * as Runtime from '@runtime'
import { Json } from '@shared'
import { Errors, NewlineCharacter, Time, Try } from '@shared'
import { Artifacts, type BrowserRuntime, FS, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import { Exec } from '@shared/os'
import { Cancellation } from '@shared/web'
import type * as Workspace from '@workspace'

import { createPreviewHarness, type PreviewHarness } from './Preview/PreviewHarness'
import * as PreviewMeasurement from './Preview/PreviewMeasurement'
import { describePreviewWork, type PreviewEditTrace, type PreviewWork } from './Preview/PreviewWork'
import type { ReloadTiming } from './ReloadTimings'

/** previewPerformance measures source edits through two isolated headless Expo web previews.
 *  macOS requires host process access before any browser starts; no screenshots are captured. */
export async function previewPerformance(options: PreviewOptions) {
  if (Platform.systemInfo().os === 'Darwin') {
    await Exec.requireHostProcessAccess('Run ./agent unsandboxed performance preview; Chrome was not launched.')
  }
  const measurement = PreviewMeasurement.readPreviewMeasurement(options.measurement)
  const resources: Resources = {
    errors: [],
    reloads: [],
    sessionId: Platform.randomUUID(),
    measurement,
    launchController: Cancellation.createController(),
  }
  return await Try(() => measurePreview(options, resources), {
    async finally() {
      await disposePreview(options, resources)
    },
  })
}

/** PreviewOptions supplies a compile session, generated app, and canonical starting Tao source. */
export type PreviewOptions = {
  workspace: Workspace.WorkspaceSession
  project: Workspace.Project
  initialSource: string
  measurement?: Partial<PreviewMeasurement.PreviewMeasurement>
}

type Resources = {
  sessionId: string
  measurement: PreviewMeasurement.PreviewMeasurement
  errors: string[]
  reloads: ReloadTiming[]
  launchController: Cancellation.Controller
  launching?: Promise<string>
  expo?: Runtime.ExpoSession
  startupMs?: number
  opening?: PreviewOpeningTimings
  frameSizes?: PreviewFrameSize[]
  harness?: PreviewHarness
  browser?: HeadlessBrowser.HeadlessBrowserSession
}
type PreviewResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: ReloadTiming['pipeline']
  editTrace: PreviewEditTrace
  stages?: unknown
  frames: Record<string, PreviewFrameTimings>
}

type PreviewFrameSize = { id: string; width: number; height: number }
type PreviewFrameTimings = {
  clickToHmrMs: number
  hmrToAppliedMs: number
  clickToAppliedMs: number
  metroDeltaModules?: number
}

/** PreviewOpeningTimings measures first opening and successive openings of fresh frames in the same session. */
export type PreviewOpeningTimings = { firstMs: number; reopenMs: number[] }

async function measurePreview(options: PreviewOptions, owned: Resources) {
  const started = Time.nowMs()
  const source = PreviewMeasurement.createMeasurementFiles(options.initialSource, owned.measurement)
  const scenarios = PreviewMeasurement.createMeasurementScenarios(owned.measurement)
  owned.harness = await createPreviewHarness({
    workspace: options.workspace,
    preview: () => owned.launching ??= startPreview(options, owned, source),
    sessionId: owned.sessionId,
    canonicalSource: source.entry,
    scenarios,
    frameCount: owned.measurement.frameCount,
    onReload(timing) {
      owned.reloads.push(timing)
    },
  })
  owned.browser = await HeadlessBrowser.launch('performance preview')
  const page = await openMeasurementPage(owned.browser, owned.errors)
  await page.goto(owned.harness.url)
  await page.locator('body[data-status="closed"] #open:enabled').waitFor()
  await page.locator('iframe[src]').waitFor({ state: 'detached' })
  owned.startupMs = Time.nowMs() - started
  const firstMs = await measurePreviewOpen(page, owned.measurement)
  owned.frameSizes = await page.locator('iframe').evaluateAll(frames =>
    frames.map(frame => ({
      id: frame.id,
      width: frame.clientWidth,
      height: frame.clientHeight,
    }))
  )
  const results = await runScenarios(page, scenarios.map(scenario => scenario.name), owned.measurement)
  await waitForReloadReports(owned, results)
  const reopenMs = await measurePreviewReopens(page, owned.measurement)
  owned.opening = { firstMs, reopenMs }
  const fixtureSha256 = Platform.hashText(options.initialSource)
  const path = await writeReport(options.project, owned, results, fixtureSha256)
  return {
    path,
    sessionId: owned.sessionId,
    results,
    reloads: owned.reloads,
    startupMs: owned.startupMs,
    opening: owned.opening,
  }
}

async function startPreview(
  options: PreviewOptions,
  owned: Resources,
  fixture: PreviewMeasurement.MeasurementSource,
): Promise<string> {
  const sourcePath = await prepareMeasurementSource(options, fixture)
  requirePublished(await options.workspace.openFile(sourcePath))
  const signal = owned.launchController.signal
  signal.throwIfAborted()
  owned.expo = await Runtime.start(options.workspace.runtime!, { signal })
  return owned.expo.url
}

async function prepareMeasurementSource(options: PreviewOptions, fixture: PreviewMeasurement.MeasurementSource) {
  const sourcePath = Path.join(options.project.directory, '_source/Performance.tao')
  await FS.mkdir(Path.dirname(sourcePath))
  for (const file of fixture.extraFiles) {
    await FS.writeFile(Path.join(options.project.directory, `_source/${file.name}.tao`), file.source, 'utf8')
  }
  await FS.writeFile(sourcePath, fixture.entry, 'utf8')
  return sourcePath
}

async function openMeasurementPage(browser: HeadlessBrowser.HeadlessBrowserSession, errors: string[]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  return page
}

async function measurePreviewReopens(page: HeadlessBrowser.Page, measurement: PreviewMeasurement.PreviewMeasurement) {
  const reopenMs: number[] = []
  for (let index = 0; index < PreviewMeasurement.PreviewReopenCount; index++) {
    await page.getByRole('button', { name: 'Close previews' }).click()
    await page.locator('body[data-status="closed"]').waitFor()
    reopenMs.push(await measurePreviewOpen(page, measurement))
  }
  return reopenMs
}

async function measurePreviewOpen(page: HeadlessBrowser.Page, measurement: PreviewMeasurement.PreviewMeasurement) {
  await page.getByRole('button', { name: 'Show previews' }).click()
  await page.locator('body:is([data-status="ready"],[data-status="failed"])').waitFor({ timeout: 60_000 })
  const state = await page.evaluate(() => window.__taoPreviewState)
  if (state.previewOpenMs === undefined || state.status !== 'ready') {
    Errors.ThrowShouldNeverHappen(state.error ?? 'Preview did not acknowledge its first render.')
  }
  await waitForFrameText(page, 'Hello World', measurement)
  return state.previewOpenMs
}

async function runScenarios(
  page: HeadlessBrowser.Page,
  scenarios: readonly string[],
  measurement: PreviewMeasurement.PreviewMeasurement,
): Promise<PreviewResult[]> {
  for (const [index, scenario] of scenarios.entries()) {
    await page.locator('#run').click({ timeout: 5000 })
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
      Errors.ThrowShouldNeverHappen(state.error ?? 'Preview update failed.')
    }
    await PreviewMeasurement.assertMeasurementScenario(page, scenario, measurement)
  }
  return await page.evaluate(() => window.__taoPreviewState.results) as PreviewResult[]
}

async function disposePreview(options: PreviewOptions, owned: Resources): Promise<void> {
  owned.launchController.abort()
  const cleanups: PromiseSettledResult<unknown>[] = await Promise.allSettled([owned.browser?.close()])
  cleanups.push(
    ...await Promise.allSettled([
      Try(() => owned.harness?.dispose()),
    ]),
  )
  await owned.launching?.catch(() => undefined)
  cleanups.push(...await Promise.allSettled([owned.expo?.dispose()]))
  await options.workspace.dispose()
  const output = owned.expo ? await owned.expo.output() : undefined
  const logPath = Artifacts.resolvePath('logs/performance', `preview-${owned.sessionId}.log`)
  await Artifacts.mkdir(Path.dirname(logPath))
  Artifacts.trackTemporary(logPath)
  await Artifacts.write(
    logPath,
    [output?.stdout, output?.stderr, ...owned.errors].filter(Boolean).join(NewlineCharacter),
  )
  for (const cleanup of cleanups) {
    if (cleanup.status === 'rejected') {
      Errors.Throw(cleanup.reason)
    }
  }
}

async function waitForFrameText(
  page: HeadlessBrowser.Page,
  text: string,
  measurement: PreviewMeasurement.PreviewMeasurement,
): Promise<void> {
  for (const frameId of PreviewMeasurement.measurementFrameIds(measurement.frameCount)) {
    await page.frameLocator(`#${frameId}`).getByText(text, { exact: true }).waitFor({ timeout: 60_000 })
  }
}

async function writeReport(
  project: Workspace.Project,
  owned: Resources,
  results: PreviewResult[],
  fixtureSha256: string,
): Promise<string> {
  const directory = Artifacts.resolvePath('logs/performance')
  await Artifacts.mkdir(directory)
  const path = Path.join(directory, `preview-${owned.sessionId}.json`)
  Artifacts.trackTemporary(path)
  const report: PreviewPerformanceReport = {
    version: 1,
    sessionId: owned.sessionId,
    commit: await Exec.captureStdout('git', 'rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
    modified: await Exec.captureStdout('git', 'status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
    system: Platform.systemInfo(),
    runtime: Platform.runtimeVersion(),
    fixtureSha256,
    browser: await owned.browser!.version(),
    generatedProject: project.directory,
    startupMs: owned.startupMs,
    opening: owned.opening,
    frameSizes: owned.frameSizes,
    measurement: PreviewMeasurement.describeMeasurement(owned.measurement),
    primaryMetric: 'parentClickToLastAppliedMs',
    reloads: owned.reloads,
    definitions: {
      compile: 'In-process parse, AST transform and code generation; typecheck/fix/check explicitly skipped.',
      updateDone: 'Actual Expo Metro client update-done event; React may still have work pending.',
      applied: 'Matching revision acknowledged by a React effect after commit; no physical-paint claim.',
      total: 'Parent click to receipt measured entirely on the parent monotonic clock.',
      observedSource: 'Reload source-observed timings may restart after duplicate watch observations; secondary only.',
      startup: 'Harness server and headless page launch through ready controls, with Expo and preview frames unopened.',
      previewOpen: 'Show previews click through the last frame’s first React commit receipt; reopen retains Expo.',
    },
    results: results.map((result, index) => describeResult(result, index, owned.measurement.frameCount)),
  }
  await Artifacts.write(path, serializePreviewPerformanceReport(report))
  return path
}

type PreviewPerformanceReport = {
  version: 1
  sessionId: string
  commit: string
  modified: boolean
  system: Platform.SystemInformation
  runtime: string
  fixtureSha256: string
  browser: string
  generatedProject: string
  startupMs: Resources['startupMs']
  opening: Resources['opening']
  frameSizes: Resources['frameSizes']
  measurement: PreviewMeasurement.MeasurementDescription
  primaryMetric: string
  reloads: ReloadTiming[]
  definitions: PreviewPerformanceDefinitions
  results: PreviewPerformanceResult[]
}

type PreviewPerformanceDefinitions = {
  compile: string
  updateDone: string
  applied: string
  total: string
  observedSource: string
  startup: string
  previewOpen: string
}

function serializePreviewPerformanceReport(report: PreviewPerformanceReport): string {
  return Json.Print(report)
}

function requirePublished(result: Workspace.UpdateResult): void {
  if (result.status !== 'published') {
    const detail = result.status === 'failed' ? ` ${result.error}` : ''
    Errors.ThrowShouldNeverHappen(`Initial preview source was ${result.status}.${detail}`)
  }
}

async function waitForReloadReports(owned: Resources, results: readonly PreviewResult[]): Promise<void> {
  const reported = await Time.waitFor(success => {
    const allReported = results.every(result => owned.reloads.some(timing => timing.revision === result.revision))
    return allReported ? success(true) : undefined
  }, { timeout: 5000, interval: 10 })
  if (reported === undefined) {
    Errors.ThrowShouldNeverHappen('Preview receipts did not reach the terminal timing reporter.')
  }
}

type PreviewPerformanceResult = PreviewResult & {
  sample: PreviewMeasurement.MeasurementSample
  parentClickToLastAppliedMs: number
  work: PreviewWork
}

function describeResult(result: PreviewResult, index: number, frameCount: number): PreviewPerformanceResult {
  const frames = Object.values(result.frames)
  if (frames.length !== frameCount) {
    Errors.ThrowShouldNeverHappen(`Measurement ${result.revision} did not collect its complete React receipt quorum.`)
  }
  const parentClickToLastAppliedMs = Math.max(...frames.map(frame => frame.clickToAppliedMs))
  const work = describePreviewWork(result.timings, result.editTrace, frames.map(frame => frame.metroDeltaModules))
  return { ...result, sample: PreviewMeasurement.classifyMeasurementSample(index), parentClickToLastAppliedMs, work }
}
