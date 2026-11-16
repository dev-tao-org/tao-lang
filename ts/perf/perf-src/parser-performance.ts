import type * as Grammar from '@grammar'
import { Json } from '@shared'
import { Errors, Timings, type TimingSample } from '@shared'
import { Artifacts, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import { parserFixtures } from './parser-fixtures'
import type { ParserFixture } from './parser-fixtures'
import { transformerSamples } from './transformer-samples'

/** parserPerformance measures fresh-process startup and warmed full parses, retaining raw samples.
 *  Cold means a fresh Bun process with warm OS/tool caches; no browser or repaint is measured. */
export async function parserPerformance(build: readonly TimingSample[]) {
  const samples: Sample[] = build.map(sample => ({ ...sample, scenario: 'rebuild' }))
  samples.push(...await coldSamples())
  samples.push(...await warmSamples())
  samples.push(...await transformerSamples())
  const summary = summarizeSamples(samples)
  const directory = Artifacts.resolvePath('logs/performance')
  await Artifacts.mkdir(directory)
  const path = Path.join(directory, `parser-${Platform.randomUUID()}.json`)
  Artifacts.trackTemporary(path)
  const report: ParserPerformanceReport = {
    version: 1,
    commit: await Exec.captureStdout('git', 'rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
    modified: await Exec.captureStdout('git', 'status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
    system: Platform.systemInfo(),
    bun: await Exec.captureStdout('bun', '--version'),
    node: await Exec.captureStdout('node', '--version'),
    fixtureHash: await createParserFixtureFingerprint(),
    definitions: {
      cold: '5 fresh Bun processes; OS, Node headers and native build caches retained.',
      warm: '20 unrecorded warmups per fixture, then 100 full parses per fixture in one process.',
      rebuild: 'One forced grammar generation/native rebuild; tool and Node header caches retained.',
      transformer: 'Minimal benchmark: 20 warmups, then 100 parse-to-code samples, including authored injections.',
    },
    summary,
    samples,
  }
  await Artifacts.write(path, serializeParserPerformanceReport(report))
  return { path, summary }
}

/** ParserSampleSummary records the measured distribution for one parser operation. */
export type ParserSampleSummary = {
  phase: string
  count: number
  minMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
}

/** summarizeSamples groups raw operation samples by scenario and reports their distribution. */
export function summarizeSamples(samples: readonly Sample[]): ParserSampleSummary[] {
  const groups = new Map<string, number[]>()
  for (const sample of samples) {
    const key = sample.scenario + '/' + sample.name
    const group = groups.get(key) ?? []
    group.push(sample.durationMs)
    groups.set(key, group)
  }
  return [...groups].map(([phase, values]) => {
    const sorted = values.toSorted((left, right) => left - right)
    return {
      phase,
      count: sorted.length,
      minMs: sorted[0]!,
      medianMs: sorted[Math.floor(sorted.length / 2)]!,
      p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
      maxMs: sorted[sorted.length - 1]!,
    }
  })
}

type Sample = TimingSample & { scenario: string }
type ParserPerformanceReport = {
  version: 1
  commit: string
  modified: boolean
  system: Platform.SystemInformation
  bun: string
  node: string
  fixtureHash: string
  definitions: ParserPerformanceDefinitions
  summary: ParserSampleSummary[]
  samples: Sample[]
}

type ParserPerformanceDefinitions = { cold: string; warm: string; rebuild: string; transformer: string }

function serializeParserPerformanceReport(report: ParserPerformanceReport): string {
  return Json.Print(report)
}

async function createParserFixtureFingerprint(): Promise<string> {
  const fixtures = await parserFixtures()
  return Platform.hashText(Json.Print(fixtures, { prettyPrint: false }))
}

async function coldSamples(): Promise<Sample[]> {
  const samples: Sample[] = []
  for (let index = 0; index < 5; index++) {
    await sampleColdParser(samples)
  }
  return samples
}

const sampleColdParser = Timings.createTopLevelTimer(async function(timings, samples: Sample[]) {
  const output = await timings.run(runParserProcess)
  const child = parseColdParserSamples(output)
  samples.push(...child.map(sample => ({ ...sample, scenario: 'cold-initial' })))
  samples.push(...timings.samples.map(sample => ({ ...sample, scenario: 'cold-initial' })))
})

function parseColdParserSamples(output: string): TimingSample[] {
  return Json.Parse(output) as TimingSample[]
}

const runParserProcess = Timings.measured('parser.process-wall', async function(): Promise<string> {
  return await Exec.captureStdout('bun', ['run', Repo.resolvePath('ts/perf/perf-src/parser-sample.ts')], {
    cwd: Repo.resolvePath('ts'),
  })
})

async function warmSamples(): Promise<Sample[]> {
  const Grammar = await import('@grammar')
  const parser = Grammar.createParser()
  const samples: Sample[] = []
  for (const fixture of await parserFixtures()) {
    for (let index = 0; index < 120; index++) {
      sampleWarmParser(parser, fixture, index, samples)
    }
  }
  return samples
}

const sampleWarmParser = Timings.createTopLevelTimer(
  function(
    timings,
    parser: Grammar.Parser,
    fixture: ParserFixture,
    index: number,
    samples: Sample[],
  ) {
    const tree = timings.run(parser.parse, fixture.source)
    if (tree.rootNode.hasError || tree.rootNode.text !== fixture.source) {
      Errors.ThrowShouldNeverHappen('Warm parser sample did not parse the complete ' + fixture.scenario + ' fixture.')
    }
    if (index >= 20) {
      samples.push(...timings.samples.map(sample => ({ ...sample, scenario: fixture.scenario })))
    }
  },
)
