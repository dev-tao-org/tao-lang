import * as Runtime from '@runtime/Runtime'
import { Errors, Time, Try } from '@shared'
import { Artifacts, FileSystem, HeadlessBrowser, Path, Platform, Repo } from '@shared/os'
import {
  createModuleRefreshFixture,
  type ModuleRefreshFixture,
  type ModuleRefreshLayout,
} from './module-refresh-fixture'

/** moduleRefreshPerformance compares generated component module groupings through real Metro refreshes. */
export async function moduleRefreshPerformance() {
  const owned: Resources = { layouts: [], expos: [], pageErrors: [], sessionId: Platform.randomUUID() }
  return await Try(() => measureLayouts(owned), { finally: () => disposeLayouts(owned) })
}

type LayoutRuntime = {
  name: ModuleRefreshLayout
  fixture: ModuleRefreshFixture
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
  browser?: HeadlessBrowser.Browser
}
type BrowserMetrics = { primaryRenders: number; secondaryRenders: number }
type RefreshSample = {
  layout: ModuleRefreshLayout
  sample: number
  factor: number
  editStartMs: number
  receiptMs: number
  durationMs: number
  primaryRenders: number
  secondaryRenders: number
  secondaryRenderDelta: number
}
const layouts: readonly ModuleRefreshLayout[] = ['single-app', 'per-source-file', 'per-view']
const warmupCount = 1
const measuredSamplesPerLayout = 7
const reportDefinitions = {
  workload:
    'Manual generated two-view Tao component tree; state begins at 1 and 10, then each view is incremented before refresh samples.',
  moduleLayouts:
    'One App module; component-only grouped view module plus values and wiring; separate component-only module per view plus values and wiring.',
  refresh:
    'One existing module file is rewritten per sample with a changed primary label and computed factor; initial full tree is written before Expo starts.',
  receipt:
    'Monotonic time from immediately before the source write through observing the new label and computed text with both retained counts; React DOM commit observation, not Metro phase timing or physical paint.',
  samples:
    `${warmupCount} unrecorded warm refresh per layout, then ${measuredSamplesPerLayout} raw measured refreshes per layout in rotating order.`,
  renderMetric:
    'Secondary component render-count delta around each source write reports unrelated component renders; it is diagnostic, not a pass threshold.',
  limits:
    'Experimental generated workload only. Coordinated/topology changes, invalid-source recovery, publication integration and device rendering are unsupported or unmeasured.',
}
async function measureLayouts(owned: Resources) {
  if (Platform.systemInfo().os === 'Darwin') {
    await Platform.requireHostProcessAccess('Run ./agent unsandboxed performance modules; Chrome was not launched.')
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
  await FileSystem.mkdir(root, { recursive: true })
  for (const name of layouts) {
    const fixture = createModuleRefreshFixture(name)
    const application = await Runtime.create({
      directory: Path.join(root, name),
      dependencyDirectory,
    })
    await writeInitialTree(application, fixture)
    const expo = await Runtime.start(application)
    owned.expos.push(expo)
    const page = await createPage(expo.url, owned)
    owned.layouts.push({ name, fixture, application, expo, page })
    await expectBaseline(owned.layouts.at(-1)!)
  }
}

async function writeInitialTree(application: Runtime.RuntimeApplication, fixture: ModuleRefreshFixture): Promise<void> {
  for (const file of fixture.files) {
    const path = file.path === 'src/App.tsx' ? application.appPath : Path.join(application.directory, file.path)
    await FileSystem.mkdir(Path.dirname(path), { recursive: true })
    await FileSystem.writeFile(path, file.source, 'utf8')
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
  const editStartMs = Time.nowMs()
  const path = layout.fixture.editedPath === 'src/App.tsx'
    ? layout.application.appPath
    : Path.join(layout.application.directory, layout.fixture.editedPath)
  await FileSystem.writeFile(path, layout.fixture.editSource(factor, label), 'utf8')
  await waitForReceipt(layout.page, label, factor)
  const receiptMs = Time.nowMs()
  const after = await readMetrics(layout.page)
  return {
    layout: layout.name,
    sample,
    factor,
    editStartMs,
    receiptMs,
    durationMs: receiptMs - editStartMs,
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
    const durations = samples.filter(sample => sample.layout === layout).map(sample => sample.durationMs).sort((a, b) =>
      a - b
    )
    return {
      layout,
      samples: durations.length,
      medianMs: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      unrelatedSecondaryRenderDeltas: samples
        .filter(sample => sample.layout === layout)
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
  await Artifacts.mkdir(directory, { recursive: true })
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
        pageErrors: owned.pageErrors,
        definitions: reportDefinitions,
        summary: summarize(samples),
        samples,
      },
      null,
      2,
    ),
  )
  Artifacts.trackTemporary(path)
  return path
}

async function disposeLayouts(owned: Resources): Promise<void> {
  await Try(async () => await owned.browser?.close(), { catch: () => undefined })
  for (const expo of owned.expos.toReversed()) {
    await Try(async () => await expo.dispose(), { catch: () => undefined })
  }
  await Try(async () => owned.root && FileSystem.rm(owned.root, { recursive: true, force: true }), {
    catch: () => undefined,
  })
}
