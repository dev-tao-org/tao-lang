import * as CLIKit from '@cli-kit'
import type * as RepoAnalysis from '@repo-analysis'
import { NewlineCharacter, Time, Try, UserInput } from '@shared'
import { Artifacts, FS, Path, Repo } from '@shared/os'
import { planTestExecution, type TestExecutionOptions } from '../dev-cli/testing/TestPlan'
import { checkEditorTypeScript } from './editor-typescript'
import { prepareNativeLocks } from './native-lock-build'
import { prepareParser } from './parser-build'
import { prepareRuntime } from './runtime-build'

/** assertNewWorkspaceTree rejects source links that could make tools traverse outside the workspace. */
export async function assertNewWorkspaceTree(root = Repo.getWorkspaceRoot()): Promise<void> {
  const workspacePath = Path.join(root, 'ts')
  Repo.assertNewWorkspacePath(workspacePath, root)
  const workspace = FS.realpathSync(workspacePath)
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await FS.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('_gen_')) {
        continue
      }
      const path = `${directory}/${entry.name}`
      if (entry.isSymbolicLink()) {
        const target = FS.realpathSync(path)
        if (!Path.isWithin(workspace, target)) {
          UserInput.fail(`Workspace source links must remain inside ts/: ${path}`)
        }
      } else if (entry.isDirectory()) {
        await visit(path)
      } else {
        // Ordinary files and special entries do not introduce traversable source links.
      }
    }
  }
  await visit(workspace)
}

/** workspaceTypes checks only the new TypeScript workspace. */
export async function workspaceTypes(): Promise<void> {
  await checkEditorTypeScript()
  const RepoAnalysis = await import('@repo-analysis')
  RepoAnalysis.assertPackageApis()
  const workspace = Repo.resolvePath('ts')
  const manifests = RepoAnalysis.readWorkspaceManifestPaths(workspace)
  const configs = await readTypeScriptProjects(workspace, manifests)
  await CLIKit.runNonInteractiveCommand('tsc', ['--build', ...configs], { cwd: workspace })
}

async function readTypeScriptProjects(workspace: string, manifests: readonly string[]): Promise<string[]> {
  const projects = await Promise.all(manifests.map(async manifest => {
    const directory = Path.dirname(manifest)
    const sources = await FS.listSourceFiles(directory)
    const configPath = Path.relative(workspace, Path.join(directory, 'tsconfig.json'))
    return sources.length > 0 ? configPath : undefined
  }))
  return projects.filter((project): project is string => project !== undefined)
}

/** workspaceShellSyntax checks the root entrypoints and portable bootstrap without executing them. */
export async function workspaceShellSyntax(): Promise<void> {
  for (
    const path of [
      'agent',
      'dev',
      'tao',
      'enter-tao-dev-env.sh',
      '.config/cli-environment.sh',
      '.config/prepared-environment.sh',
      '.config/bootstrap-tao-dev-env',
      '.config/nix/nix-bootstrap.sh',
      '.cursor/worktree-setup.sh',
    ]
  ) {
    await CLIKit.runNonInteractiveCommand('sh', ['-n', path], { cwd: Repo.getWorkspaceRoot() })
  }
}

/** workspaceConformance checks API documentation, source syntax and type-aware style rules. */
export async function workspaceConformance(): Promise<void> {
  // Formatting and test execution also import this module; load the compiler only for source checks.
  const RepoAnalysis = await import('@repo-analysis')
  const started = Time.nowMs()
  const result = await RepoAnalysis.analyzeSourceConformance(Repo.getWorkspaceRoot())
  const elapsed = Math.round(Time.nowMs() - started)
  CLIKit.IO.print(`Checked source conformance: ${result.findings.length} issue(s) in ${elapsed}ms`)
  if (result.findings.length > 0) {
    UserInput.fail(
      result.findings.map(({ file, line, message }) => `${file}${line === undefined ? '' : ':' + line}: ${message}`)
        .join(NewlineCharacter),
    )
  }
  await writeTestOnlyUsageReport(result)
}

/** workspaceDeadExports rejects unreferenced exports in the new TypeScript implementation. */
export async function workspaceDeadExports(): Promise<void> {
  // Tao bindings, generated native siblings and declaration facades await their new implementations.
  await CLIKit.runNonInteractiveCommand('knip', '--config repo-analysis/scripts/knip.ts --no-progress', {
    cwd: Repo.resolvePath('ts'),
  })
  await CLIKit.runNonInteractiveCommand('knip', '--config repo-analysis/scripts/knip.ts --no-progress --production', {
    cwd: Repo.resolvePath('ts'),
  })
}

/** workspaceTests prepares shared assets once and runs the selected suites with bounded workers. */
export async function workspaceTests(
  args: readonly string[] = [],
  slowSeconds = 0.075,
  options: TestExecutionOptions = {},
): Promise<void> {
  const selection = {
    typescriptArgs: args,
    taoTarget: args.length === 0 ? Repo.resolvePath('Apps') : undefined,
    ...options,
  }
  planTestExecution(selection)
  await prepareParser()
  await prepareNativeLocks()
  await prepareRuntime()
  if (shouldPrepareExtensionAssets(args)) {
    const { prepareExtensionAssets } = await import('../dev-cli/ide/ExtensionBuild')
    await prepareExtensionAssets()
  }
  const { runTestPlan } = await import('../dev-cli/testing/TestWorkers')
  await runTestPlan({ ...selection, slowSeconds })
}

function shouldPrepareExtensionAssets(args: readonly string[]): boolean {
  if (args.length === 0) {
    return true
  }
  const root = Repo.getWorkspaceRoot()
  const workspace = Path.resolve(root, 'ts')
  return args.some(argument => {
    if (argument === '--test-name-pattern' || argument.includes('ide-extension')) {
      return true
    }
    return isWithinDirectory(workspace, Path.resolve(root, argument))
  })
}

const TestOnlyUsageReportFilename = 'test-only-usage.md'

async function writeTestOnlyUsageReport(result: RepoAnalysis.SourceConformanceResult): Promise<void> {
  await Try(async () => {
    const started = Time.nowMs()
    const report = await result.readUsageReport()
    const reportPath = Artifacts.resolvePath(TestOnlyUsageReportFilename)
    await FS.write(reportPath, report.markdown)
    const elapsed = Math.round(Time.nowMs() - started)
    const counts =
      `${report.moduleCount} module(s), ${report.declarationCount} declaration(s), ${report.optionalArgumentCount} optional argument(s)`
    CLIKit.IO.print(
      `Test-only usage candidates in ${elapsed}ms (${counts}). See .artifacts/${TestOnlyUsageReportFilename}`,
    )
  }, { catch: error => CLIKit.IO.warn(`Could not produce the test-only usage report: ${String(error)}`) })
}

function isWithinDirectory(path: string, directory: string): boolean {
  return Path.isWithin(directory, path)
}
