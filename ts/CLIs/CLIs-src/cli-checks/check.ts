import { runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { FileSystem, Path, Repo } from '@shared/os'
import { checkEditorTypeScript } from './editor-typescript'
import { prepareParser } from './parser-build'
import { prepareRuntime } from './runtime-build'
import { withTestTimings } from './slow-tests'

/** assertNewWorkspacePath confines requested paths to the selected root and excludes the reference implementation. */
export function assertNewWorkspacePath(path: string, root = Repo.getWorkspaceRoot()): void {
  const absolute = Path.resolve(path)
  let existing = absolute
  while (!FileSystem.existsSync(existing)) {
    const parent = Path.dirname(existing)
    if (parent === existing) {
      break
    }
    existing = parent
  }
  const canonical = FileSystem.realpathSync(existing)
  const legacy = FileSystem.existsSync(legacyRoot) ? FileSystem.realpathSync(legacyRoot) : legacyRoot
  if (isWithinDirectory(absolute, legacyRoot) || isWithinDirectory(canonical, legacy)) {
    Errors.ThrowUserInput('Run legacy workflows from .x-tao-old-v1/; root commands target the new implementation.')
  }
  const canonicalRoot = FileSystem.realpathSync(root)
  if (!isWithinDirectory(absolute, root) || !isWithinDirectory(canonical, canonicalRoot)) {
    Errors.ThrowUserInput(`Requested paths must remain inside ${root}: ${path}`)
  }
}

/** assertNewWorkspaceTree rejects source links that could make tools traverse outside the workspace. */
export async function assertNewWorkspaceTree(): Promise<void> {
  const workspace = FileSystem.realpathSync(Repo.resolvePath('ts'))
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await FileSystem.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('_gen_')) {
        continue
      }
      const path = `${directory}/${entry.name}`
      if (entry.isSymbolicLink()) {
        const target = FileSystem.realpathSync(path)
        assertNewWorkspacePath(target)
        if (!isWithinDirectory(target, workspace)) {
          Errors.ThrowUserInput(`Workspace source links must remain inside ts/: ${path}`)
        }
      } else if (entry.isDirectory()) {
        await visit(path)
      }
    }
  }
  await visit(workspace)
}

/** workspaceTypes checks only the new TypeScript workspace. */
export async function workspaceTypes(): Promise<void> {
  await assertNewWorkspaceTree()
  await checkEditorTypeScript()
  const packages = [
    '0-workspace',
    '1-grammar',
    '2-ast-gen',
    '3-typecheck',
    '4-fix',
    '5-check',
    '6-compile',
    '7-runtime',
    'CLIs',
    'ide-extension',
    'perf',
    'shared',
  ]
  const discoveredProjects = await Promise.all(packages.map(async project => {
    const sourceFiles = await FileSystem.sourceFiles(Repo.resolvePath('ts', project))
    return sourceFiles.length > 0 ? project : undefined
  }))
  const projects = discoveredProjects.filter((project): project is string => project !== undefined)
  await runCommand('tsc --build', {
    variadicArgs: projects.map(project => `${project}/tsconfig.json`),
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
      '.config/bootstrap-tao-dev-env',
      '.config/nix/nix-bootstrap.sh',
      '.cursor/worktree-setup.sh',
    ]
  ) {
    await runCommand('sh -n', { variadicArgs: [path], cwd: Repo.getWorkspaceRoot() })
  }
}

/** workspaceConformance checks API documentation and exception/comment syntax without a type checker. */
export async function workspaceConformance(): Promise<void> {
  await assertNewWorkspaceTree()
  // Formatting and test execution also import this module; load the compiler only for source checks.
  const { checkSourceConformance } = await import('./source-conformance')
  await checkSourceConformance(Repo.getWorkspaceRoot())
}

/** workspaceDeadExports rejects unreferenced exports in the new TypeScript implementation. */
export async function workspaceDeadExports(): Promise<void> {
  await assertNewWorkspaceTree()
  // Tao bindings, generated native siblings and declaration facades await their new implementations.
  await runCommand('knip --config scripts/knip.ts --no-progress', { cwd: Repo.resolvePath('ts') })
}

/** workspaceTests runs workspace tests with dots and end-of-run slow-test warnings. */
export async function workspaceTests(args: readonly string[] = []): Promise<void> {
  await prepareParser()
  await prepareRuntime()
  if (shouldPrepareExtensionAssets(args)) {
    const { prepareExtensionAssets } = await import('../dev-cli/ide/ExtensionBuild')
    await prepareExtensionAssets()
  }
  await withTestTimings(reportPath =>
    runCommand(reportPath ? 'bun test --dots --reporter=junit --reporter-outfile' : 'bun test --dots', {
      variadicArgs: [...(reportPath ? [reportPath] : []), ...args],
      cwd: Repo.resolvePath('ts'),
    })
  )
}

/** shouldPrepareExtensionAssets selects test runs that need the authored IDE asset tree. */
export function shouldPrepareExtensionAssets(args: readonly string[]): boolean {
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

/** workspaceFormat formats or checks the new workspace and shared repository files. */
export async function workspaceFormat(mode: 'fmt' | 'check'): Promise<void> {
  await assertNewWorkspaceTree()
  await runCommand(`dprint ${mode} --config .dprint.jsonc --incremental=false **/* --excludes .x-tao-old-v1/**`, {
    cwd: Repo.getWorkspaceRoot(),
  })
  await runCommand(`just --fmt ${mode === 'check' ? '--check ' : ''}--justfile Justfile`, {
    cwd: Repo.getWorkspaceRoot(),
  })
}

function isWithinDirectory(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}/`)
}

const legacyRoot = Repo.resolvePath('.x-tao-old-v1')
