import { Env, Terminal } from '@shared/os'
import { IO, type IOConfiguration, renderOutput } from '../io'

/** CLIEntrypoint names the caller whose default presentation and routing are configured. */
export type CLIEntrypoint = 'dev' | 'agent' | 'tao'

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
    forwardEvents: Env.is('CLI_OUTPUT_EVENTS', '1'),
    passthrough: options.delegate,
  })
  if (options.delegate) {
    Env.set('TERMINAL_OUTPUT', resolved.routing.stdout === 'terminal' ? '1' : '0')
    Env.set('TERMINAL_UI', resolved.ui ? '1' : '0')
  } else if (resolved.ui && !Env.is('CLI_OUTPUT_EVENTS', '1')) {
    const { createTUI } = await import('./tui/TUI')
    const factory = async () => createTUI()
    IO.setPromptRenderer(factory)
    renderOutput(await factory())
  } else {
    // Headless or event-forwarded output already has routing and needs no local TUI.
  }
}

function resolveOutputConfiguration(entrypoint: CLIEntrypoint, environment: {
  ui?: string
  terminalOutput?: string
  tty: boolean
}) {
  const ui = environment.tty && (environment.ui ?? (entrypoint === 'dev' ? '1' : '0')) === '1'
  const terminal = environment.terminalOutput === '1'
    || (environment.terminalOutput === undefined && entrypoint !== 'agent')
  const routing: IOConfiguration = {
    stdout: terminal ? 'terminal' : 'log',
    stderr: terminal ? 'terminal' : 'log',
    progress: terminal ? 'terminal' : 'log',
    logDirectory: entrypoint === 'agent' ? 'agent' : 'dev',
  }
  return { ui, routing }
}
