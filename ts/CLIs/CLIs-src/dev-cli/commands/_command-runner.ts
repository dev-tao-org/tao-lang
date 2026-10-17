import { IO, repositoryRoot, runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { Platform } from '@shared/os'
import { existsSync, realpathSync } from '@shared/os/FileSystem'
import { readdir } from '@shared/os/FileSystem'
import { dirname, resolve } from '@shared/os/Path'
import { withTestTimings } from '../../cli-kit/slow-tests'

/** CommandDefinition declares a command's metadata and inline implementation. */
export type CommandDefinition<Args extends unknown[] = []> = {
  name: string
  description: string
  arguments?: readonly CommandArgument[]
  allowUnknownOptions?: boolean
  action: (...args: Args) => void | Promise<void>
}

type CommandArgument = {
  name: string
  description?: string
  required?: boolean
  variadic?: boolean
  defaultValue?: unknown
}

/** RegisteredCommand exposes metadata and an awaited action that propagates failures. */
export type RegisteredCommand<Args extends unknown[]> = Omit<CommandDefinition<Args>, 'action'> & {
  action: (...args: Args) => Promise<void>
}

const commands: CommandDefinition<unknown[]>[] = []
/** repositoryRoot locates the active checkout independently of the caller's directory. */
export { repositoryRoot } from '@cli-kit'

/** assertNewWorkspacePath directs legacy operations to their own working directory. */
export function assertNewWorkspacePath(path: string): void {
  const absolute = resolve(path)
  let existing = absolute
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) {
      break
    }
    existing = parent
  }
  const canonical = realpathSync(existing)
  const legacy = existsSync(legacyRoot) ? realpathSync(legacyRoot) : legacyRoot
  if (isWithinDirectory(absolute, legacyRoot) || isWithinDirectory(canonical, legacy)) {
    Errors.ThrowUserInput('Run legacy workflows from old-tao-v1/; root commands target the new implementation.')
  }
}

/** assertNewWorkspaceTree rejects source links that could make tools traverse outside the workspace. */
export async function assertNewWorkspaceTree(): Promise<void> {
  const workspace = realpathSync(`${repositoryRoot}/ts`)
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue
      }
      const path = `${directory}/${entry.name}`
      if (entry.isSymbolicLink()) {
        const target = realpathSync(path)
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

/** registerCommand adds one command to the shared CLI registry. */
export function registerCommand<Args extends unknown[]>(definition: CommandDefinition<Args>): RegisteredCommand<Args> {
  const registered = {
    ...definition,
    action: async (...args: Args): Promise<void> => {
      await definition.action(...args)
    },
  }
  commands.push({ ...registered, action: (...args: unknown[]) => registered.action(...args as Args) })
  return registered
}

/** execute parses and executes the registered commands for one CLI invocation. */
export async function execute(name = 'dev'): Promise<void> {
  // Setup can register and invoke its action before Commander has been installed.
  const { Command } = await import('commander')
  const parser = new Command().name(name).configureOutput({ writeErr: text => IO.stderr(text) })
  for (const definition of commands) {
    const command = parser.command(definition.name).description(definition.description)
    for (const argument of definition.arguments ?? []) {
      const label = `${argument.name}${argument.variadic ? '...' : ''}`
      command.argument(argument.required ? `<${label}>` : `[${label}]`, argument.description, argument.defaultValue)
    }
    command.allowUnknownOption(definition.allowUnknownOptions ?? false)
    command.action(async (...args: unknown[]) => {
      await definition.action(...args.slice(0, definition.arguments?.length ?? 0))
    })
  }
  await parser.parseAsync(Platform.argv)
}

/** runLegacyDev delegates existing CLI workflows to the reference implementation. */
export async function runLegacyDev(args: string[]): Promise<void> {
  await runCommand('./dev', { variadicArgs: args, cwd: legacyRoot })
}

/** runLegacyRecipe retains legacy prerequisites, workflow ordering and exit status. */
export async function runLegacyRecipe(args: string[]): Promise<void> {
  await runCommand('just --justfile Justfile', { variadicArgs: args, cwd: legacyRoot })
}

const legacyRoot = `${repositoryRoot}/old-tao-v1`

/** workspaceTypes checks only the new TypeScript workspace. */
export async function workspaceTypes(): Promise<void> {
  await assertNewWorkspaceTree()
  await runCommand('tsc --project tsconfig.json', {
    cwd: `${repositoryRoot}/ts`,
  })
}

/** workspaceConformance checks API documentation and exception/comment syntax without a type checker. */
export async function workspaceConformance(): Promise<void> {
  await assertNewWorkspaceTree()
  const { checkSourceConformance } = await import('../../cli-kit/source-conformance')
  await checkSourceConformance(repositoryRoot)
}

/** workspaceDeadExports rejects unreferenced exports in the new TypeScript implementation. */
export async function workspaceDeadExports(): Promise<void> {
  await assertNewWorkspaceTree()
  // Tao bindings, generated native siblings and declaration facades await their new implementations.
  await runCommand('knip --config knip.ts --no-progress', { cwd: `${repositoryRoot}/ts` })
}

/** workspaceTests runs workspace tests with dots, file logs and end-of-run slow-test warnings. */
export async function workspaceTests(args: readonly string[] = []): Promise<void> {
  await withTestTimings(reportPath =>
    runCommand('bun test', {
      variadicArgs: [...(reportPath ? ['--reporter=junit', '--reporter-outfile', reportPath] : []), '--dots', ...args],
      cwd: `${repositoryRoot}/ts`,
      stdout: 'log',
    })
  )
}

/** workspaceFormat formats or checks the new workspace and shared repository files. */
export async function workspaceFormat(mode: 'fmt' | 'check'): Promise<void> {
  await assertNewWorkspaceTree()
  await runCommand(`dprint ${mode} --config .dprint.jsonc --incremental=false **/* --excludes old-tao-v1/**`, {
    cwd: repositoryRoot,
  })
  await runCommand(`just --fmt ${mode === 'check' ? '--check ' : ''}--justfile Justfile`, { cwd: repositoryRoot })
}
