import * as Runtime from '@runtime'
import { Json } from '@shared'
import { Errors, Regxs, Time, Try } from '@shared'
import { Artifacts, FS, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import * as ModuleRefreshFixtureModule2 from './module-refresh-fixture'

/** moduleRefreshPerformance compares generated component module groupings through real Metro refreshes. */
export async function moduleRefreshPerformance() {
  const owned: Resources = { layouts: [], expos: [], pageErrors: [], sessionId: Platform.randomUUID() }
  return await Try(() => measureLayouts(owned), { finally: () => disposeLayouts(owned) })
}

type LayoutRuntime = {
  name: ModuleRefreshFixtureModule2.ModuleRefreshLayout
  fixture: ModuleRefreshFixtureModule2.ModuleRefreshFixture
  application: Runtime.RuntimeApplication
  expo: Runtime.ExpoSession
  page: HeadlessBrowser.Page
}
type Resources = {
  sessionId: string
  layouts: LayoutRuntime[]
  expos: Runtime.ExpoSession[]
  pageErrors: string[]
  root?: string
  browser?: HeadlessBrowser.HeadlessBrowserSession
}
type BrowserMetrics = { primaryRenders: number; secondaryRenders: number }
type RefreshSample = {
  layout: ModuleRefreshFixtureModule2.ModuleRefreshLayout
  sample: number
  factor: number
  publicationStartMs: number
  receiptMs: number
  publicationToReceiptMs: number
  primaryRenders: number
  secondaryRenders: number
  secondaryRenderDelta: number
}
const layouts: readonly ModuleRefreshFixtureModule2.ModuleRefreshLayout[] = [
  'single-app',
  'per-source-file',
  'per-view',
]
const warmupCount = 1
const measuredSamplesPerLayout = 7
const reportDefinitions = {
  workload:
    'Manual generated two-view Tao component tree; state begins at 1 and 10, then each view is incremented before refresh samples.',
  moduleLayouts:
    'One App module; component-only grouped view module plus values and wiring; separate component-only module per view plus values and wiring.',
  refresh:
    'Each sample submits one complete generated revision through ExpoSession.publish, changing the primary label and computed factor while retaining the full module namespace.',
  receipt:
    'Monotonic time from immediately before submitting the complete revision through observing the new label and computed text with both retained counts; React DOM commit observation, not Metro phase timing or physical paint.',
  samples:
    `${warmupCount} unrecorded warm refresh per layout, then ${measuredSamplesPerLayout} raw measured refreshes per layout in rotating order.`,
  renderMetric:
    'Secondary component render-count delta around each revision publication reports unrelated component renders; it is diagnostic, not a pass threshold.',
  limits:
    'Experimental generated workload published through ExpoSession.publish. Coordinated/topology changes, invalid-source recovery, filesystem-watch publication and device rendering are unsupported or unmeasured.',
}
async function measureLayouts(owned: Resources) {
  if (Platform.systemInfo().os === 'Darwin') {
    await Exec.requireHostProcessAccess('Run ./agent unsandboxed performance modules; Chrome was not launched.')
  }
  await prepareLayouts(owned)
  const samples = await runAlternatingSamples(owned.layouts)
  const path = await writeReport(owned, samples)
  return { path, summary: summarize(samples), samples }
}

async function prepareLayouts(owned: Resources): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `module-refresh-${owned.sessionId}`)
  owned.root = root
  const dependencyDirectory = Repo.resolvePath('ts/7-runtime/node_modules')
  await FS.mkdir(root)
  for (const name of layouts) {
    const fixture = ModuleRefreshFixtureModule2.createModuleRefreshFixture(name)
    const application = await Runtime.create({
      directory: Path.join(root, name),
      dependencyDirectory,
    })
    application.generated = createRevision(fixture, 0, 2, 'Primary baseline')
    const expo = await Runtime.start(application)
    owned.expos.push(expo)
    const page = await createPage(expo.url, owned)
    owned.layouts.push({ name, fixture, application, expo, page })
    await expectBaseline(owned.layouts.at(-1)!)
  }
}

type GeneratedModuleRevision = {
  revision: string
  sequence: number
  files: Readonly<Record<string, string>>
}
function createRevision(
  fixture: ModuleRefreshFixtureModule2.ModuleRefreshFixture,
  sequence: number,
  factor: number,
  label: string,
): GeneratedModuleRevision {
  const files = Object.fromEntries(fixture.files.map(file => [
    file.path.replace(Regxs.SourceDirectoryPrefixRegx, ''),
    file.path === fixture.editedPath ? fixture.editSource(factor, label) : file.source,
  ]))
  return {
    revision: `module-refresh-${sequence}`,
    sequence,
    files,
  }
}

async function createPage(url: string, owned: Resources): Promise<HeadlessBrowser.Page> {
  owned.browser ??= await HeadlessBrowser.launch('performance modules')
  const page = await owned.browser.newPage({ viewport: { width: 768, height: 1024 } })
  page.setDefaultTimeout(10_000)
  page.on('pageerror', error => owned.pageErrors.push(error.message))
  await page.goto(url)
  return page
}

async function expectBaseline(layout: LayoutRuntime): Promise<void> {
  await expectText(layout.page, 'primary-label', 'Primary baseline')
  await expectText(layout.page, 'primary-count', '1')
  await expectText(layout.page, 'primary-scaled', '2')
  await expectText(layout.page, 'secondary-count', '10')
  await expectText(layout.page, 'secondary-scaled', '20')
  await layout.page.getByTestId('increment-primary').click()
  await layout.page.getByTestId('increment-secondary').click()
  await expectText(layout.page, 'primary-count', '2')
  await expectText(layout.page, 'secondary-count', '11')
}

async function runAlternatingSamples(layoutsToMeasure: LayoutRuntime[]): Promise<RefreshSample[]> {
  const samples: RefreshSample[] = []
  for (const layout of layoutsToMeasure) {
    await refreshAndVerify(layout, 3, `${layout.name} warmup`, 0)
  }
  for (let sample = 1; sample <= measuredSamplesPerLayout; sample++) {
    const first = (sample - 1) % layoutsToMeasure.length
    for (let offset = 0; offset < layoutsToMeasure.length; offset++) {
      const layout = layoutsToMeasure[(first + offset) % layoutsToMeasure.length]
      const factor = sample % 2 === 1 ? 2 : 3
      samples.push(await refreshAndVerify(layout, factor, `${layout.name} sample ${sample}`, sample))
    }
  }
  return samples
}

async function refreshAndVerify(
  layout: LayoutRuntime,
  factor: number,
  label: string,
  sample: number,
): Promise<RefreshSample> {
  const before = await readMetrics(layout.page)
  const revision = createRevision(layout.fixture, sample + 1, factor, label)
  const publicationStartMs = Time.nowMs()
  const publication = await layout.expo.publish(revision)
  if (publication.status !== 'published') {
    Errors.ThrowHostEnvironment(`Module refresh publication failed: ${publication.status}`)
  }
  await waitForReceipt(layout.page, label, factor)
  const receiptMs = Time.nowMs()
  const after = await readMetrics(layout.page)
  return {
    layout: layout.name,
    sample,
    factor,
    publicationStartMs,
    receiptMs,
    publicationToReceiptMs: receiptMs - publicationStartMs,
    primaryRenders: after.primaryRenders,
    secondaryRenders: after.secondaryRenders,
    secondaryRenderDelta: after.secondaryRenders - before.secondaryRenders,
  }
}

async function waitForReceipt(page: HeadlessBrowser.Page, label: string, factor: number): Promise<void> {
  await page.waitForFunction(
    expected =>
      document.querySelector('[data-testid="primary-label"]')?.textContent === expected.label
      && document.querySelector('[data-testid="primary-count"]')?.textContent === '2'
      && document.querySelector('[data-testid="primary-scaled"]')?.textContent === String(expected.factor * 2),
    { label, factor },
    { timeout: 90_000 },
  )
  await expectText(page, 'secondary-count', '11')
  await expectText(page, 'secondary-scaled', '22')
}

async function expectText(page: HeadlessBrowser.Page, testID: string, expected: string): Promise<void> {
  await page.waitForFunction(
    value => document.querySelector(`[data-testid="${value.testID}"]`)?.textContent === value.expected,
    { testID, expected },
  )
}

async function readMetrics(page: HeadlessBrowser.Page): Promise<BrowserMetrics> {
  return await page.evaluate(() => ({
    primaryRenders: (globalThis as any).__taoModuleRefreshMetrics.primaryRenders,
    secondaryRenders: (globalThis as any).__taoModuleRefreshMetrics.secondaryRenders,
  }))
}

function summarize(samples: RefreshSample[]) {
  return layouts.map(layout => {
    const durations = samples.filter(sample => sample.layout === layout).map(sample => sample.publicationToReceiptMs)
      .sort((a, b) => a - b)
    return {
      layout,
      samples: durations.length,
      medianMs: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      unrelatedSecondaryRenderDeltas: samples.filter(sample => sample.layout === layout)
        .map(sample => sample.secondaryRenderDelta),
    }
  })
}

function percentile(values: number[], percentile: number): number {
  return values[Math.min(values.length - 1, Math.ceil(values.length * percentile) - 1)]
}

async function writeReport(owned: Resources, samples: RefreshSample[]): Promise<string> {
  if (owned.pageErrors.length > 0) {
    Errors.ThrowShouldNeverHappen(`Module refresh browser errors: ${owned.pageErrors.join(' | ')}`)
  }
  const directory = Artifacts.resolvePath('logs/performance')
  const path = Path.join(directory, `module-refresh-${owned.sessionId}.json`)
  await Artifacts.mkdir(directory)
  const report: ModuleRefreshPerformanceReport = {
    version: 2,
    sessionId: owned.sessionId,
    commit: await Exec.captureStdout('git', 'rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
    modified: await Exec.captureStdout('git', 'status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
    system: Platform.systemInfo(),
    browser: await owned.browser!.version(),
    pageErrors: owned.pageErrors,
    definitions: reportDefinitions,
    summary: summarize(samples),
    samples,
  }
  await Artifacts.write(path, serializeModuleRefreshPerformanceReport(report))
  Artifacts.trackTemporary(path)
  return path
}

type ModuleRefreshPerformanceReport = {
  version: 2
  sessionId: string
  commit: string
  modified: boolean
  system: Platform.SystemInformation
  browser: string
  pageErrors: string[]
  definitions: typeof reportDefinitions
  summary: ModuleRefreshPerformanceSummary
  samples: RefreshSample[]
}

type ModuleRefreshPerformanceSummary = {
  layout: ModuleRefreshFixtureModule2.ModuleRefreshLayout
  samples: number
  medianMs: number
  p95Ms: number
  unrelatedSecondaryRenderDeltas: number[]
}[]

function serializeModuleRefreshPerformanceReport(report: ModuleRefreshPerformanceReport): string {
  return Json.Print(report)
}

async function disposeLayouts(owned: Resources): Promise<void> {
  await Try(async () => await owned.browser?.close(), { catch: () => undefined })
  for (const expo of owned.expos.toReversed()) {
    await Try(async () => await expo.dispose(), { catch: () => undefined })
  }
  await Try(async () => owned.root && FS.rm(owned.root, { recursive: true, force: true }), {
    catch: () => undefined,
  })
}
