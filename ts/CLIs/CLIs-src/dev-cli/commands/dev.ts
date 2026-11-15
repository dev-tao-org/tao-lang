import { IO } from '@cli-kit'
import { ControlCCharacter, NewlineCharacter, Try } from '@shared'
import { Browser, Process, Terminal } from '@shared/os'
import { Cancellation } from '@shared/web'
import { startDevelopmentPreview } from '../preview/DevelopmentPreview'
import { startPerformanceEditor } from '../preview/PerformanceProject'
import { registerCommand } from './_command-runner'

/** devCommand runs the keyboard launcher and owns opened development apps until exit. */
export default registerCommand({
  name: 'dev',
  description: 'Open development apps with keyboard shortcuts and keep their sessions running.',
  options: [{ flags: '--yes', description: 'Authorize required dependency setup and preview restarts.' }],
  action: (options: { yes?: boolean }) => runDevelopmentLoop(options.yes),
})

type DevelopmentApp = { readonly url?: string; dispose(): Promise<void> }
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
    ['p', { label: 'Performance', start: startPerformanceEditor }],
    ['v', { label: 'Live Preview', start: () => startDevelopmentPreview(controller.signal, yes) }],
  ])
  const sessions: DevelopmentSessions = new Map()
  IO.print([...apps].map(([key, app]) => `${key}  ${app.label}`).concat('q  Quit').join(NewlineCharacter))
  const stopKeys = listenForDevelopmentApps(apps, sessions, controller)
  await Try(() => Process.waitForTermination(controller.signal), {
    async finally() {
      stopKeys()
      controller.abort()
      IO.setCommands([])
      IO.progress('Shutting down…')
      await Promise.all([...sessions.values()].map(async pending => (await pending)?.dispose()))
    },
  })
}

function listenForDevelopmentApps(
  apps: AppLaunches,
  sessions: DevelopmentSessions,
  controller: Cancellation.Controller,
): () => void {
  let stop = Terminal.listenForKeys(dispatch)
  return () => stop()

  function dispatch(key: string): void {
    if (key === 'q' || key === ControlCCharacter) {
      controller.abort()
      return
    }
    const app = apps.get(key)
    if (!app || controller.signal.aborted) {
      return
    }
    stop()
    void Try(() => openDevelopmentApp(key, app, sessions, controller.signal), {
      finally() {
        if (!controller.signal.aborted) {
          stop = Terminal.listenForKeys(dispatch)
        }
      },
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
