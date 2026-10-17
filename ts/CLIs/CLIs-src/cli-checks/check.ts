import { runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { FileSystem, Path, Repo } from '@shared/os'
import { withTestTimings } from './slow-tests'

/** assertNewWorkspacePath directs legacy operations to their own working directory. */
export function assertNewWorkspacePath(path: string): void {
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
    Errors.ThrowUserInput('Run legacy workflows from old-tao-v1/; root commands target the new implementation.')
  }
}

/** assertNewWorkspaceTree rejects source links that could make tools traverse outside the workspace. */
export async function assertNewWorkspaceTree(): Promise<void> {
  const workspace = FileSystem.realpathSync(Repo.resolvePath('ts'))
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await FileSystem.readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
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

function isWithinDirectory(path: string, directory: string): boolean {
  return path === directory || path.startsWith(`${directory}/`)
}

const legacyRoot = Repo.resolvePath('old-tao-v1')

/** workspaceTypes checks only the new TypeScript workspace. */
export async function workspaceTypes(): Promise<void> {
  await assertNewWorkspaceTree()
  await runCommand('tsc --project tsconfig.json', {
    cwd: Repo.resolvePath('ts'),
  })
}

/** workspaceShellSyntax checks the root entrypoints and portable bootstrap without executing them. */
export async function workspaceShellSyntax(): Promise<void> {
  for (
    const path of [
      'agent',
      'dev',
      '.config/cli-environment.sh',
      '.config/bootstrap-tao-dev-env',
      '.config/nix/nix-bootstrap.sh',
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
  await runCommand('knip --config knip.ts --no-progress', { cwd: Repo.resolvePath('ts') })
}

/** workspaceTests runs workspace tests with dots and end-of-run slow-test warnings. */
export async function workspaceTests(args: readonly string[] = []): Promise<void> {
  await withTestTimings(reportPath =>
    runCommand(reportPath ? 'bun test --dots --reporter=junit --reporter-outfile' : 'bun test --dots', {
      variadicArgs: [...(reportPath ? [reportPath] : []), ...args],
      cwd: Repo.resolvePath('ts'),
    })
  )
}

/** workspaceFormat formats or checks the new workspace and shared repository files. */
export async function workspaceFormat(mode: 'fmt' | 'check'): Promise<void> {
  await assertNewWorkspaceTree()
  await runCommand(`dprint ${mode} --config .dprint.jsonc --incremental=false **/* --excludes old-tao-v1/**`, {
    cwd: Repo.getWorkspaceRoot(),
  })
  await runCommand(`just --fmt ${mode === 'check' ? '--check ' : ''}--justfile Justfile`, {
    cwd: Repo.getWorkspaceRoot(),
  })
}
