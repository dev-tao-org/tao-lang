import { Errors, Time, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo } from '@shared/os'
import { createWasmDocumentSession } from '../../ide-extensions/tao-ide-extension/tao-ide-extension-src/core'
import { semanticTokenRanges } from '../../ide-extensions/tao-ide-extension/tao-ide-extension-src/SemanticTokens'

/** extensionPerformance measures incremental editor parsing, injected TSX and highlight queries. */
export async function extensionPerformance() {
  const root = Repo.resolvePath('.artifacts/ide-extension/package')
  const assets = {
    taoGrammar: await FileSystem.readFile(Path.join(root, 'grammars/tree-sitter-tao.wasm')),
    tsxGrammar: await FileSystem.readFile(Path.join(root, 'grammars/tree-sitter-tsx.wasm')),
    taoQuery: await FileSystem.readFile(Path.join(root, 'queries/tao-highlights.scm'), 'utf8'),
    tsxQuery: await FileSystem.readFile(Path.join(root, 'queries/tsx-highlights.scm'), 'utf8'),
  }
  const fixture = await FileSystem.readFile(Repo.resolvePath('Apps/Dev/Kitchen Sink/Kitchen Sink.tao'), 'utf8')
  let current: Sample[] = []
  const samples: Sample[] = []
  const session = await createWasmDocumentSession(assets, (phase, durationMs) => current.push({ phase, durationMs }))
  await Try(async () => {
    session.document.update(fixture)
    for (let index = 0; index < 120; index++) {
      current = []
      const source = index % 2 === 0 ? fixture.replace('Kitchen Sink', 'Kitchen sink') : fixture
      const start = Time.nowMs()
      const result = session.document.update(source)
      current.push({ phase: 'editor.update', durationMs: Time.nowMs() - start })
      const rangesStarted = Time.nowMs()
      semanticTokenRanges(result.tokens)
      current.push({ phase: 'editor.token-ranges', durationMs: Time.nowMs() - rangesStarted })
      if (result.diagnostics.length > 0 || result.tokens.length === 0) {
        Errors.ThrowShouldNeverHappen('Extension performance fixture did not produce valid highlighted syntax.')
      }
      if (index >= 20) {
        samples.push(...current)
      }
    }
  }, { finally: session.dispose })
  return writeReport(fixture, samples)
}

type Sample = { phase: string; durationMs: number }

async function writeReport(fixture: string, samples: Sample[]) {
  const path = Artifacts.resolvePath('logs/performance', `extension-${Platform.randomUUID()}.json`)
  const summary = summarize(samples)
  await Artifacts.mkdir(Path.dirname(path), { recursive: true })
  Artifacts.trackTemporary(path)
  const report: ExtensionPerformanceReport = {
    version: 1,
    commit: await Platform.capture('git rev-parse HEAD', { cwd: Repo.getWorkspaceRoot() }),
    modified: await Platform.capture('git status --porcelain', { cwd: Repo.getWorkspaceRoot() }) !== '',
    definition:
      'Kitchen Sink: 20 warmups then 100 alternating text edits. Records parsing/query updates and nonoverlapping token ranges separately. Excludes VS Code rendering.',
    fixtureHash: Platform.hashText(fixture),
    system: Platform.systemInfo(),
    summary,
    samples,
  }
  await Artifacts.write(path, serializeExtensionPerformanceReport(report))
  return { path, summary }
}

type ExtensionPerformanceReport = {
  version: 1
  commit: string
  modified: boolean
  definition: string
  fixtureHash: string
  system: ReturnType<typeof Platform.systemInfo>
  summary: ReturnType<typeof summarize>
  samples: Sample[]
}

function serializeExtensionPerformanceReport(report: ExtensionPerformanceReport): string {
  return JSON.stringify(report, null, 2)
}

function summarize(samples: Sample[]) {
  const phases = [...new Set(samples.map(sample => sample.phase))]
  return phases.map(phase => {
    const values = samples.filter(sample => sample.phase === phase).map(sample => sample.durationMs).sort((a, b) =>
      a - b
    )
    return {
      phase,
      count: values.length,
      medianMs: values[Math.floor(values.length / 2)]!,
      p95Ms: values[Math.ceil(values.length * 0.95) - 1]!,
    }
  })
}
