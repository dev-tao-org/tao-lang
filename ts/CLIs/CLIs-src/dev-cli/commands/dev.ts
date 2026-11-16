import { IO } from '@cli-kit'
import { ControlCCharacter, NewlineCharacter, Try } from '@shared'
import { Browser, Process, Terminal } from '@shared/os'
import { Cancellation } from '@shared/web'
import { workflowUI } from '../../tao-cli/WorkflowUI'
import { registerCommand } from './_command-runner'

/** devCommand runs the keyboard launcher and owns opened development apps until exit. */
export default registerCommand({
  name: 'dev',
  description: 'Open development apps with keyboard shortcuts and keep their sessions running.',
  options: [{ flags: '--yes', description: 'Authorize required dependency setup and preview restarts.' }],
  action: (options: { yes?: boolean }) => runDevelopmentLoop(options.yes),
})

type DevelopmentApp = { readonly url?: string; readonly stopped?: boolean; dispose(): Promise<void> }
type AppLaunch = { label: string; start(): Promise<DevelopmentApp> }
type AppLaunches = ReadonlyMap<string, AppLaunch>
type OptionalDevelopmentApp = DevelopmentApp | undefined
type DevelopmentSessions = Map<string, Promise<OptionalDevelopmentApp>>
type DevelopmentSignal = Cancellation.Controller['signal']

async function runDevelopmentLoop(yes?: boolean): Promise<void> {
  if (!Terminal.isInteractive()) {
    IO.print('Run ./dev in an interactive terminal to open development apps. Use ./dev help for all commands.')
    return
  }
  const controller = Cancellation.createController()
  const apps: AppLaunches = new Map([
    ['p', {
      label: 'Performance',
      async start() {
        const { startPerformanceEditor } = await import('../preview/PerformanceProject')
        return await startPerformanceEditor()
      },
    }],
    ['v', {
      label: 'Live Preview',
      async start() {
        const { startDevelopmentPreview } = await import('../preview/DevelopmentPreview')
        return await startDevelopmentPreview(controller.signal, ui)
      },
    }],
  ])
  const sessions: DevelopmentSessions = new Map()
  IO.print([...apps].map(([key, app]) => `${key}  ${app.label}`).concat('q  Quit').join(NewlineCharacter))
  const keys = listenForDevelopmentApps(apps, sessions, controller)
  const ui = workflowUI(yes, controller.signal, options => keys.withoutKeys(() => IO.askTerminalConfirmation(options)))
  await Try(() => Process.waitForTermination(controller.signal), {
    async finally() {
      keys.stop()
      controller.abort()
      IO.setCommands([])
      IO.progress('Shutting down…')
      await Promise.all([...sessions.values()].map(async pending => (await pending)?.dispose()))
    },
  })
}

type DevelopmentKeys = { stop(): void; withoutKeys(run: () => Promise<boolean>): Promise<boolean> }

function listenForDevelopmentApps(
  apps: AppLaunches,
  sessions: DevelopmentSessions,
  controller: Cancellation.Controller,
): DevelopmentKeys {
  let stop = Terminal.listenForKeys(dispatch)
  let paused = 0
  return {
    stop: () => stop(),
    async withoutKeys(run) {
      if (++paused === 1) {
        stop()
      }
      return await Try(run, {
        finally() {
          if (--paused === 0 && !controller.signal.aborted) {
            stop = Terminal.listenForKeys(dispatch)
          }
        },
      })
    },
  }

  function dispatch(key: string): void {
    if (key === 'q' || key === ControlCCharacter) {
      controller.abort()
      return
    }
    const app = apps.get(key)
    if (!app || controller.signal.aborted) {
      return
    }
    void Try(() => openDevelopmentApp(key, app, sessions, controller.signal), {
      catch: error => IO.warn(`${app.label} could not open. ${String(error)}`),
    })
  }
}

async function openDevelopmentApp(
  key: string,
  app: AppLaunch,
  sessions: DevelopmentSessions,
  signal: DevelopmentSignal,
): Promise<void> {
  let pending = sessions.get(key)
  if (pending && (await pending)?.stopped) {
    if (sessions.get(key) !== pending) {
      return
    }
    sessions.delete(key)
    pending = undefined
  }
  if (signal.aborted) {
    return
  }
  if (pending === undefined) {
    IO.progress('Starting ' + app.label + '…')
    pending = Promise.resolve(Try(() => app.start(), {
      catch(error) {
        sessions.delete(key)
        IO.warn(`${app.label} could not start. ${String(error)}`)
        return undefined
      },
    }))
    sessions.set(key, pending)
  }
  const active = await pending
  const url = active?.url
  if (url && !signal.aborted) {
    await Try(() => Browser.openUrl(url), {
      catch: error => IO.warn(`Open ${url} in your browser. ${String(error)}`),
    })
  }
}
