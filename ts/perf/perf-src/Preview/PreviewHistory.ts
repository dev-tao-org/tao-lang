import { Errors, Regxs, Time, Try } from '@shared'
import { BuildLock, FS, Path, Platform, Repo } from '@shared/os'
import Exec from '@shared/os/exec'
import * as PreviewHistoryStore from './PreviewHistoryStore'
import { PreviewRenderSteps } from './PreviewRenderSteps'

/** recordPreviewPerformance retains one committed-input preview run, without publishing or committing data. */
export async function recordPreviewPerformance(
  measure: (source: string) => Promise<{ path: string }>,
): Promise<{ directory: string; reused: boolean }> {
  const root = Repo.getWorkspaceRoot()
  const git = (args: readonly string[], exact?: boolean) => Exec.captureStdout('git', args, { cwd: root, trim: !exact })
  const context = await captureContext(git)
  const pending = Path.join(root, '.artifacts/notes/preview-history')
  return await BuildLock.withBuildLock(Path.join(pending, `${context.sourceCommit}.lock`), async () => {
    const directories = await PreviewHistoryStore.resolveHistoryDirectories(root, context.sourceCommit, git)
    const existing = await PreviewHistoryStore.existingHistory(directories, context)
    if (existing) {
      return { directory: existing, reused: true }
    }
    const record = newRecord(context)
    const directory = directories[0]
    return await Try(async () => {
      await requireCleanInputs(git, context.sourceCommit)
      const result = await measure(context.source)
      await requireCleanInputs(git, context.sourceCommit)
      const report = await readMeasuredReport(result.path, context.sourceCommit)
      await PreviewHistoryStore.writeHistory(directory, {
        ...record,
        status: 'passed',
        reportSha256: Platform.hashText(report),
      }, report)
      return { directory, reused: false }
    }, {
      async catch(error) {
        await PreviewHistoryStore.writeHistory(directory, { ...record, status: 'failed', error: String(error) })
        Errors.Throw(error)
      },
    })
  })
}

type Git = (args: readonly string[], exact?: boolean) => Promise<string>
type Context = { sourceCommit: string; sourceTree: string; source: string; fixtureSha256: string }

const fixturePath = 'ts/perf/perf-fixtures/Performance/Performance.tao'
const inputs = [
  'ts',
  'Justfile',
  'dev',
  'agent',
  '.config',
  '.envrc',
  'devenv.nix',
  'devenv.yaml',
  'devenv.lock',
  'enter-tao-dev-env.sh',
]

async function captureContext(git: Git): Promise<Context> {
  const sourceCommit = (await git(['rev-parse', 'HEAD'])).trim()
  const sourceTree = (await git(['rev-parse', `${sourceCommit}^{tree}`])).trim()
  if (!Regxs.Sha1HashRegx.test(sourceCommit) || !Regxs.Sha1HashRegx.test(sourceTree)) {
    Errors.ThrowShouldNeverHappen('Performance recording requires full Git commit and tree identities.')
  }
  const source = await git(['show', `${sourceCommit}:${fixturePath}`], true)
  return { sourceCommit, sourceTree, source, fixtureSha256: Platform.hashText(source) }
}

function newRecord(context: Context): PreviewHistoryStore.HistoryRecord {
  return {
    version: 1,
    sourceCommit: context.sourceCommit,
    sourceTree: context.sourceTree,
    capturedAt: Time.date().toISOString(),
    status: 'failed',
    command: './agent unsandboxed performance record',
    fixture: { path: fixturePath, sha256: context.fixtureSha256 },
    scenarios: PreviewRenderSteps.map(step => step.name),
    sourceIsolation:
      'Committed fixture copied into the generated benchmark workspace; passed records require clean implementation inputs before and after capture. Raw report dirty-state provenance is preserved.',
  }
}

async function requireCleanInputs(git: Git, sourceCommit: string): Promise<void> {
  const current = (await git(['rev-parse', 'HEAD'])).trim()
  const dirty = await git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...inputs])
  if (current !== sourceCommit || dirty !== '') {
    Errors.ThrowUserInput(
      'Commit benchmark implementation inputs before recording; HEAD and inputs must stay unchanged.',
    )
  }
}

async function readMeasuredReport(path: string, sourceCommit: string): Promise<string> {
  const report = await FS.readFile(path, 'utf8')
  PreviewHistoryStore.validatePreviewReport(report, sourceCommit)
  return report
}
