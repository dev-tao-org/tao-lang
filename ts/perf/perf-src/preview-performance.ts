import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Try } from '@shared'
import { Artifacts, type BrowserRuntime, FileSystem, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import type { createWorkspace, Project, UpdateResult } from '@workspace/Workspace'
import { createPreviewHarness, type PreviewHarness } from './PreviewHarness'
import * as PreviewMeasurement from './PreviewMeasurement'
import type { ReloadTiming } from './ReloadTimings'

/** previewPerformance measures source edits through two isolated headless Expo web previews.
 *  macOS requires host process access before any browser starts; no screenshots are captured. */
export async function previewPerformance(options: PreviewOptions) {
  if (Platform.systemInfo().os === 'Darwin') {
    await Platform.requireHostProcessAccess('Run ./agent unsandboxed performance preview; Chrome was not launched.')
  }
  const measurement = PreviewMeasurement.readPreviewMeasurement(options.measurement)
  const resources: Resources = { errors: [], reloads: [], sessionId: Platform.randomUUID(), measurement }
  return await Try(() => measurePreview(options, resources), {
    async finally() {
      await disposePreview(options, resources)
    },
  })
}

/** PreviewOptions supplies a compile session, generated app, and canonical starting Tao source. */
export type PreviewOptions = {
  workspace: ReturnType<typeof createWorkspace>
  project: Project
  initialSource: string
  measurement?: Partial<PreviewMeasurement.PreviewMeasurement>
}

type Resources = {
  sessionId: string
  measurement: PreviewMeasurement.PreviewMeasurement
  errors: string[]
  reloads: ReloadTiming[]
  expo?: Runtime.ExpoSession
  startupMs?: number
  frameSizes?: PreviewFrameSize[]
  harness?: PreviewHarness
  browser?: HeadlessBrowser.Browser
}
type PreviewResult = {
  scenario: string
  revision: string
  clickTime: number
  clickTimestampMs: number
  timings: unknown[]
  stages?: unknown
  frames: Record<string, PreviewFrameTimings>
}

type PreviewFrameSize = { id: string; width: number; height: number }
type PreviewFrameTimings = { clickToHmrMs: number; hmrToAppliedMs: number; clickToAppliedMs: number }

async function measurePreview(options: PreviewOptions, owned: Resources) {
  const started = Time.nowMs()
  const fixture = PreviewMeasurement.createMeasurementFiles(options.initialSource, owned.measurement)
  const source = fixture.entry
  const scenarios = PreviewMeasurement.createMeasurementScenarios(owned.measurement)
  const sourcePath = Path.join(options.project.directory, '_source/Performance.tao')
  await FileSystem.mkdir(Path.dirname(sourcePath), { recursive: true })
  for (const file of fixture.extraFiles) {
    await FileSystem.writeFile(Path.join(options.project.directory, `_source/${file.name}.tao`), file.source, 'utf8')
  }
  await FileSystem.writeFile(sourcePath, source, 'utf8')
  requirePublished(await options.workspace.openFile(sourcePath))
  owned.expo = await Runtime.start(options.workspace.runtime!)
  owned.harness = await createPreviewHarness({
    workspace: options.workspace,
    previewUrl: owned.expo.url,
    sessionId: owned.sessionId,
    canonicalSource: source,
    scenarios,
    frameCount: owned.measurement.frameCount,
    onReload(timing) {
      owned.reloads.push(timing)
    },
  })
  owned.browser = await HeadlessBrowser.launch('performance preview')
  const page = await owned.browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', error => owned.errors.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') {
      owned.errors.push(message.text())
    }
  })
  await page.goto(owned.harness.url)
  await waitForFrameText(page, 'Hello World', owned.measurement)
  owned.startupMs = Time.nowMs() - started
  owned.frameSizes = await page.locator('iframe').evaluateAll(frames =>
    frames.map(frame => ({
      id: frame.id,
      width: frame.clientWidth,
      height: frame.clientHeight,
    }))
  )
  const results = await runScenarios(page, scenarios.map(scenario => scenario.name), owned.measurement)
  await waitForReloadReports(owned)
  const path = await writeReport(options.project, owned, results)
  return { path, sessionId: owned.sessionId, results, reloads: owned.reloads, startupMs: owned.startupMs }
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
  const cleanups: PromiseSettledResult<unknown>[] = await Promise.allSettled([owned.browser?.close()])
  cleanups.push(
    ...await Promise.allSettled([
      Try(() => owned.harness?.dispose()),
      owned.expo?.dispose(),
    ]),
  )
  await options.workspace.dispose()
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

async function waitForFrameText(
  page: HeadlessBrowser.Page,
  text: string,
  measurement: PreviewMeasurement.PreviewMeasurement,
): Promise<void> {
  for (const frameId of PreviewMeasurement.measurementFrameIds(measurement.frameCount)) {
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
        measurement: PreviewMeasurement.describeMeasurement(owned.measurement),
        primaryMetric: 'parentClickToLastAppliedMs',
        reloads: owned.reloads,
        definitions: {
          compile: 'In-process parse, AST transform and code generation; typecheck/fix/check explicitly skipped.',
          updateDone: 'Actual Expo Metro client update-done event; React may still have work pending.',
          applied: 'Matching revision acknowledged by a React effect after commit; no physical-paint claim.',
          total: 'Parent click to receipt measured entirely on the parent monotonic clock.',
          observedSource:
            'Reload source-observed timings may restart after duplicate watch observations; secondary only.',
        },
        results: results.map((result, index) => describeResult(result, index, owned.measurement.frameCount)),
      },
      null,
      2,
    ),
  )
  return path
}

function requirePublished(result: UpdateResult): void {
  if (result.status !== 'published') {
    const detail = result.status === 'failed' ? ` ${result.error}` : ''
    Errors.ThrowShouldNeverHappen(`Initial preview source was ${result.status}.${detail}`)
  }
}

async function waitForReloadReports(owned: Resources): Promise<void> {
  const deadline = Time.nowMs() + 5000
  while (owned.reloads.length < owned.measurement.editCount) {
    if (Time.nowMs() >= deadline) {
      Errors.ThrowShouldNeverHappen('Preview receipts did not reach the terminal timing reporter.')
    }
    await Time.sleep(10)
  }
}

function classifySample(index: number): 'first-edit' | 'first-cycle' | 'warm' {
  if (index === 0) {
    return 'first-edit'
  }
  if (index < 4) {
    return 'first-cycle'
  }
  return 'warm'
}

function describeResult(result: PreviewResult, index: number, frameCount: number) {
  const frames = Object.values(result.frames)
  if (frames.length !== frameCount) {
    Errors.ThrowShouldNeverHappen(`Measurement ${result.revision} did not collect its complete React receipt quorum.`)
  }
  const parentClickToLastAppliedMs = Math.max(...frames.map(frame => frame.clickToAppliedMs))
  return { ...result, sample: classifySample(index), parentClickToLastAppliedMs }
}
