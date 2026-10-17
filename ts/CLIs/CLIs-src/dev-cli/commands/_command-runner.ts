import '../../cli-kit/fatal-errors'
import { IO, runCommand } from '@cli-kit'
import { Errors } from '@shared'
import { Env, FileSystem, Path, Platform, Repo } from '@shared/os'
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

if (Platform.isMain(import.meta)) {
  const agent = Env.is('TAO_AGENT', '1')
  IO.config({
    stdout: agent ? 'log' : 'terminal',
    stderr: agent ? 'both' : 'terminal',
    logDirectory: agent ? 'agent' : 'dev',
    logFile: Env.get('TAO_AGENT_LOG'),
  })
  // Defer setup's import until this module finishes initializing: setup registers through this module.
  // Commander and the development command registry are loaded only after dependencies exist.
  void import('./setup').then(({ default: setup }) => setup.action(Platform.argv.slice(2)))
}

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

/** registerCommand adds one command to the shared CLI registry. */
export function registerCommand<Args extends unknown[]>(definition: CommandDefinition<Args>): RegisteredCommand<Args> {
  const registered = {
    ...definition,
    async action(...args: Args): Promise<void> {
      await definition.action(...args)
    },
  }
  commands.push({
    ...registered,
    action(...args: unknown[]) {
      return registered.action(...args as Args)
    },
  })
  return registered
}

/** execute parses and executes the registered commands for one CLI invocation. */
export async function execute(name = 'dev'): Promise<void> {
  // Setup can register and invoke its action before Commander has been installed.
  const { Command } = await import('commander')
  const parser = new Command().name(name).configureOutput({
    writeErr(text) {
      return IO.stderr(text)
    },
  })
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
export async function runLegacyDev(command: string, options: { variadicArgs?: readonly string[] } = {}): Promise<void> {
  await runCommand(`./dev ${command}`, { variadicArgs: options.variadicArgs, cwd: legacyRoot })
}

const legacyRoot = Repo.resolvePath('old-tao-v1')

/** workspaceTypes checks only the new TypeScript workspace. */
export async function workspaceTypes(): Promise<void> {
  await assertNewWorkspaceTree()
  await runCommand('tsc --project tsconfig.json', {
    cwd: Repo.resolvePath('ts'),
  })
}

/** workspaceConformance checks API documentation and exception/comment syntax without a type checker. */
export async function workspaceConformance(): Promise<void> {
  await assertNewWorkspaceTree()
  const { checkSourceConformance } = await import('../../cli-kit/source-conformance')
  await checkSourceConformance(Repo.getWorkspaceRoot())
}

/** workspaceDeadExports rejects unreferenced exports in the new TypeScript implementation. */
export async function workspaceDeadExports(): Promise<void> {
  await assertNewWorkspaceTree()
  // Tao bindings, generated native siblings and declaration facades await their new implementations.
  await runCommand('knip --config knip.ts --no-progress', { cwd: Repo.resolvePath('ts') })
}

/** workspaceTests runs workspace tests with dots, file logs and end-of-run slow-test warnings. */
export async function workspaceTests(args: readonly string[] = []): Promise<void> {
  await withTestTimings(reportPath =>
    runCommand(reportPath ? 'bun test --dots --reporter=junit --reporter-outfile' : 'bun test --dots', {
      variadicArgs: [...(reportPath ? [reportPath] : []), ...args],
      cwd: Repo.resolvePath('ts'),
      stdout: 'log',
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
