import * as CLIKit from '@cli-kit'
import { Errors } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { planTestExecution, type TestExecutionOptions } from '../dev-cli/testing/TestPlan'
import { checkEditorTypeScript } from './editor-typescript'
import { prepareNativeLocks } from './native-lock-build'
import { assertPackageApis } from './PackageApis'
import { prepareParser } from './parser-build'
import { prepareRuntime } from './runtime-build'

/** assertNewWorkspacePath confines requested paths to the selected root and excludes the reference implementation. */
export function assertNewWorkspacePath(path: string, root = Repo.getWorkspaceRoot()): void {
  const absolute = Path.resolve(path)
  let existing = absolute
  while (!FS.existsSync(existing)) {
    const parent = Path.dirname(existing)
    if (parent === existing) {
      break
    }
    existing = parent
  }
  const canonical = FS.realpathSync(existing)
  const legacy = FS.existsSync(legacyRoot) ? FS.realpathSync(legacyRoot) : legacyRoot
  if (isWithinDirectory(absolute, legacyRoot) || isWithinDirectory(canonical, legacy)) {
    Errors.ThrowUserInput('Run legacy workflows from .x-tao-old-v1/; root commands target the new implementation.')
  }
  const canonicalRoot = FS.realpathSync(root)
  if (!isWithinDirectory(absolute, root) || !isWithinDirectory(canonical, canonicalRoot)) {
    Errors.ThrowUserInput(`Requested paths must remain inside ${root}: ${path}`)
  }
}

/** assertNewWorkspaceTree rejects source links that could make tools traverse outside the workspace. */
export async function assertNewWorkspaceTree(): Promise<void> {
  const workspace = FS.realpathSync(Repo.resolvePath('ts'))
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await FS.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('_gen_')) {
        continue
      }
      const path = `${directory}/${entry.name}`
      if (entry.isSymbolicLink()) {
        const target = FS.realpathSync(path)
        assertNewWorkspacePath(target)
        if (!isWithinDirectory(target, workspace)) {
          Errors.ThrowUserInput(`Workspace source links must remain inside ts/: ${path}`)
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
  await assertNewWorkspaceTree()
  await checkEditorTypeScript()
  assertPackageApis()
  const packages = [
    '0-workspace',
    '1-grammar',
    '2-ast-gen',
    '2.5-source-validation',
    '3-typecheck',
    '4-fix',
    '5-check',
    '6-compile',
    '7-runtime',
    'CLIs',
    'ide-extensions/tao-ide-extension',
    'ide-extensions/dev-tao-org',
    'perf',
    'shared',
    'stdlib',
    'ts-api',
  ]
  const discoveredProjects = await Promise.all(packages.map(async project => {
    const sourceFiles = await FS.listSourceFiles(Repo.resolvePath('ts', project))
    return sourceFiles.length > 0 ? project : undefined
  }))
  const projects = discoveredProjects.filter((project): project is string => project !== undefined)
  const configs = projects.map(project => `${project}/tsconfig.json`)
  await CLIKit.runNonInteractiveCommand('tsc', ['--build', ...configs], {
    cwd: Repo.resolvePath('ts'),
  })
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
  await assertNewWorkspaceTree()
  // Formatting and test execution also import this module; load the compiler only for source checks.
  const { checkSourceConformance } = await import('./source-conformance')
  await checkSourceConformance(Repo.getWorkspaceRoot(), true)
}

/** workspaceDeadExports rejects unreferenced exports in the new TypeScript implementation. */
export async function workspaceDeadExports(): Promise<void> {
  await assertNewWorkspaceTree()
  // Tao bindings, generated native siblings and declaration facades await their new implementations.
  await CLIKit.runNonInteractiveCommand('knip', '--config scripts/knip.ts --no-progress', {
    cwd: Repo.resolvePath('ts'),
  })
  await CLIKit.runNonInteractiveCommand('knip', '--config scripts/knip.ts --no-progress --production', {
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

type FormatMode = 'fmt' | 'check'
/** workspaceFormat formats or checks the new workspace and shared repository files. */
export async function workspaceFormat(mode: FormatMode, excludedPaths: readonly string[] = []): Promise<void> {
  await assertNewWorkspaceTree()
  await CLIKit.runNonInteractiveCommand(
    'dprint',
    [
      mode,
      '--config',
      '.dprint.jsonc',
      '--incremental=false',
      '**/*',
      '--excludes',
      '.x-tao-old-v1/**',
      ...excludedPaths,
    ],
    { cwd: Repo.getWorkspaceRoot() },
  )
  const justfile = Repo.resolvePath('Justfile')
  const excludesJustfile = excludedPaths.some(path => Path.resolve(Repo.getWorkspaceRoot(), path) === justfile)
  if (excludesJustfile) {
    return
  }
  const formatArgs = ['--fmt', ...mode === 'check' ? ['--check'] : [], '--justfile', 'Justfile']
  await CLIKit.runNonInteractiveCommand('just', formatArgs, {
    cwd: Repo.getWorkspaceRoot(),
  })
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

function isWithinDirectory(path: string, directory: string): boolean {
  return Path.isWithin(directory, path)
}

const legacyRoot = Repo.resolvePath('.x-tao-old-v1')
