import { transform } from '@ast-gen/Transform'
import { fix } from '@fix/Fix'
import { format } from '@fix/Format'
import { createTypeScriptFormatter, type EmbeddedFormatter } from '@fix/lib/formatter/Embedded'
import { createParser } from '@grammar/parser'
import { Errors, joinTextLines, Json, NewlineCharacter, S, Timings, type TimingSample } from '@shared'
import { Artifacts, FileSystem, FormatterResources, Path, Platform, Repo } from '@shared/os'
import { unusedWarnings } from '@typecheck/Usage'
import { type ParserSampleSummary, summarizeSamples } from './parser-performance'

/** formatterPerformance measures snapshot formatting and import fixes separately from parsing. */
export const formatterPerformance = Timings.createTopLevelTimer(async function(initialization) {
  const bytes = await FormatterResources.typeScriptFormatterBytes()
  const typescript = initialization.run(createTypeScriptFormatter, bytes)
  const fixtures = [
    {
      scenario: 'kitchen-sink',
      source: await FileSystem.readFile(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8'),
    },
    {
      scenario: '500-views',
      source: joinTextLines(
        S`
          use tao@ui Text
          use tao@ui Col
        `,
        Array.from(
          { length: 500 },
          (_, index) => `view Example${index}(Title text, Subtitle text) { render Col { Text(Title) Text(Subtitle) } }`,
        ).join(NewlineCharacter),
      ),
    },
  ]
  const samples = fixtures.flatMap(fixture => sampleFixture(fixture, typescript))
  const summary = summarizeSamples(samples)
  const path = Artifacts.resolvePath('logs/performance', `formatter-${Platform.randomUUID()}.json`)
  await Artifacts.mkdir(Path.dirname(path))
  Artifacts.trackTemporary(path)
  const report: FormatterPerformanceReport = {
    version: 1,
    commit: await Platform.capture('git rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
    modified: await Platform.capture('git status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
    system: Platform.systemInfo(),
    initialization: initialization.samples,
    wasmBytes: bytes.byteLength,
    definition:
      '20 warmups then 100 immutable-snapshot formatting, import-fix and usage-analysis samples per fixture. Excludes parsing, AST construction, disk writes, editor rendering and preview refresh.',
    fixtures: fixtures.map(fixture => ({ scenario: fixture.scenario, hash: Platform.hashText(fixture.source) })),
    summary,
    samples,
  }
  await Artifacts.write(path, serializeFormatterPerformanceReport(report))
  return { path, summary }
})

type FormatterSample = TimingSample & { scenario: string }
type FormatterPerformanceReport = {
  version: 1
  commit: string
  modified: boolean
  system: Platform.SystemInformation
  initialization: TimingSample[]
  wasmBytes: number
  definition: string
  fixtures: FormatterFixtureReport[]
  summary: ParserSampleSummary[]
  samples: FormatterSample[]
}

type FormatterFixtureReport = { scenario: string; hash: string }

function serializeFormatterPerformanceReport(report: FormatterPerformanceReport): string {
  return Json.PrintIndented(report)
}

function sampleFixture(fixture: { source: string; scenario: string }, typescript: EmbeddedFormatter) {
  const tree = createParser().parse(fixture.source)
  const ast = transform(tree) ?? Errors.ThrowShouldNeverHappen('Formatter performance fixture has invalid syntax.')
  const samples: FormatterSample[] = []
  for (let index = 0; index < 120; index++) {
    sampleFormatting(fixture, typescript, tree, ast, index, samples)
  }
  return samples
}

const sampleFormatting = Timings.createTopLevelTimer(
  function(
    timings,
    fixture: { source: string; scenario: string },
    typescript: EmbeddedFormatter,
    tree: Parameters<typeof format>[0]['tree'],
    ast: Parameters<typeof fix>[0]['ast'],
    index: number,
    samples: FormatterSample[],
  ) {
    timings.run(format, { source: fixture.source, tree }, { typescript })
    timings.run(fix, { source: fixture.source, tree, ast })
    timings.run(unusedWarnings, ast)
    if (index >= 20) {
      samples.push(...timings.samples.map(sample => ({ ...sample, scenario: fixture.scenario })))
    }
  },
)
