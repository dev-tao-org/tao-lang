import { Env, Terminal } from '@shared/os'
import { IO, type IOConfiguration, renderOutput } from '../io'

/** CLIEntrypoint names the caller whose default presentation and routing are configured. */
export type CLIEntrypoint = 'dev' | 'agent' | 'tao'

/** resolveOutputConfiguration determines presentation once without affecting worker output identities. */
export function resolveOutputConfiguration(entrypoint: CLIEntrypoint, environment: {
  ui?: string
  terminalOutput?: string
  tty: boolean
}) {
  const ui = environment.tty && (environment.ui ?? (entrypoint === 'dev' ? '1' : '0')) === '1'
  const terminal = environment.terminalOutput === '1'
    || (environment.terminalOutput === undefined && entrypoint !== 'agent')
  const routing: IOConfiguration = {
    stdout: terminal ? 'terminal' : 'log',
    stderr: terminal ? 'terminal' : 'both',
    progress: terminal ? 'terminal' : entrypoint === 'agent' ? 'log' : 'both',
    logDirectory: entrypoint === 'agent' ? 'agent' : 'dev',
  }
  return { ui, routing }
}

/** configureCLIOutput owns environment reads and lazy TUI setup for all CLI entrypoints. */
export async function configureCLIOutput(
  entrypoint: CLIEntrypoint,
  options: { delegate?: boolean } = {},
): Promise<void> {
  const resolved = resolveOutputConfiguration(entrypoint, {
    ui: Env.get('TERMINAL_UI'),
    terminalOutput: Env.get('TERMINAL_OUTPUT'),
    tty: Terminal.stderr.isTTY === true,
  })
  IO.config({
    ...resolved.routing,
    ...(options.delegate ? { stdout: 'terminal' as const, stderr: 'terminal' as const } : {}),
    logFile: Env.get('OUTPUT_LOG_FILE'),
  })
  if (entrypoint === 'agent') {
    Env.set('TERMINAL_OUTPUT', Env.is('TERMINAL_OUTPUT', '1') ? '1' : '0')
  }
  if (options.delegate) {
    Env.set('TERMINAL_UI', resolved.ui ? '1' : '0')
  } else if (resolved.ui) {
    const { createTUI } = await import('./tui/TUI')
    renderOutput(await createTUI())
  }
}
