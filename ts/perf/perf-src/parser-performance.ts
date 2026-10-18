import { Errors, Timings, type TimingSample } from '@shared'
import { Artifacts, Path, Platform, Repo } from '@shared/os'
import { parserFixtures } from './parser-fixtures'
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
  await Artifacts.mkdir(directory, { recursive: true })
  const path = Path.join(directory, `parser-${Platform.randomUUID()}.json`)
  Artifacts.trackTemporary(path)
  await Artifacts.write(
    path,
    JSON.stringify(
      {
        version: 1,
        commit: await Platform.capture('git rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
        modified: await Platform.capture('git status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
        system: Platform.systemInfo(),
        bun: await Platform.capture('bun --version'),
        node: await Platform.capture('node --version'),
        fixtureHash: Platform.hashText(JSON.stringify(await parserFixtures())),
        definitions: {
          cold: '5 fresh Bun processes; OS, Node headers and native build caches retained.',
          warm: '20 unrecorded warmups per fixture, then 100 full parses per fixture in one process.',
          rebuild: 'One forced grammar generation/native rebuild; tool and Node header caches retained.',
          transformer: 'Full Hello World: 20 warmups, then 100 parse-to-code samples, including authored injections.',
        },
        summary,
        samples,
      },
      null,
      2,
    ),
  )
  return { path, summary }
}

/** summarizeSamples groups raw operation samples by scenario and reports their distribution. */
export function summarizeSamples(samples: readonly Sample[]) {
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

async function coldSamples(): Promise<Sample[]> {
  const samples: Sample[] = []
  for (let index = 0; index < 5; index++) {
    const timings = new Timings(`process:${Platform.pid}`)
    const output = await runParserProcess(timings)
    const child: TimingSample[] = JSON.parse(output)
    samples.push(...child.map(sample => ({ ...sample, scenario: 'cold-initial' })))
    samples.push(...timings.samples.map(sample => ({ ...sample, scenario: 'cold-initial' })))
  }
  return samples
}

const runParserProcess = Timings.measure('parser.process-wall', async function(): Promise<string> {
  return await Platform.capture('bun run', {
    variadicArgs: [Repo.resolvePath('ts/perf/perf-src/parser-sample.ts')],
    cwd: Repo.resolvePath('ts'),
  })
})

async function warmSamples(): Promise<Sample[]> {
  const { createParser } = await import('../../1-grammar/grammar-src/parser')
  const parser = createParser()
  const samples: Sample[] = []
  for (const fixture of await parserFixtures()) {
    for (let index = 0; index < 120; index++) {
      const { tree, timings } = parser.parse(fixture.source)
      if (tree.rootNode.hasError || tree.rootNode.text !== fixture.source) {
        Errors.ThrowUnexpected('Warm parser sample did not parse the complete ' + fixture.scenario + ' fixture.')
      }
      if (index >= 20) {
        samples.push(...timings.map(sample => ({ ...sample, scenario: fixture.scenario })))
      }
    }
  }
  return samples
}
