import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import * as Runtime from '@runtime'
import { ControlCCharacter, Errors, NewlineCharacter, Try } from '@shared'
import { Browser, Exec, FS, Platform, Process, Repo, Terminal } from '@shared/os'
import { Cancellation } from '@shared/web'
import * as Workspace from '@workspace'

import * as Perf from '@perf'

import { prepareRuntime } from '../../cli-checks/runtime-build'
import { workflowUI } from '../../tao-cli/WorkflowUI'
import { registerCommand } from './_command-runner'

/** devCommand runs the isolated Preview fixture in a persistent dual-preview Expo session. */
export default registerCommand({
  name: 'dev',
  description: 'Run the Preview fixture in two live previews and refresh after each button edit.',
  options: [{ flags: '--yes', description: 'Authorize required dependency setup and preview restarts.' }],
  async action(options: { yes?: boolean } = {}) {
    await runDevSession(options.yes)
  },
})

async function runDevSession(yes?: boolean): Promise<void> {
  await prepareRuntime()
  const entry = Repo.resolvePath('Apps/Dev/Preview/Preview.tao')
  const state: DevSession = { stopped: false, controller: Cancellation.createController() }
  const stop = Process.onTermination(() => requestDevExit(state))
  const ui = workflowUI(yes, state.controller.signal)
  const options = devWorkspaceOptions(state, entry, ui)
  await Try(async () => {
    state.workspace = await Workspace.execute({ kind: 'preview', entry, options }, ui)
    await startDevRuntime(state)
    IO.print('Edit Apps/Dev/Preview/Preview.tao to refresh both previews.')
    startDevActions(state)
    if (!state.stopped) {
      await Process.waitForTermination(state.controller.signal)
    }
  }, {
    async finally() {
      requestDevExit(state)
      IO.progress('Shutting down…')
      await state.recovery
      await stopDevSession(state)
      stop()
    },
  })
}

type DevWorkspaceOptions = {
  kind: 'studio'
  onSourceUpdate(result: Workspace.UpdateResult): void
  onSourceError(error: unknown): void
}

function devWorkspaceOptions(state: DevSession, entry: string, ui: Workspace.WorkflowUI): DevWorkspaceOptions {
  const options = {
    kind: 'studio',
    onSourceUpdate(result: Workspace.UpdateResult) {
      reportSourceUpdate(result)
      const canRecoverSetup = result.status === 'failed' && result.setupRequired && state.workspace
      if (canRecoverSetup && !state.recovery) {
        state.recovery = restartDevSession(state, entry, options, ui, result.error)
      }
    },
    onSourceError: reportSourceError,
  } as const
  return options
}

async function restartDevSession(
  state: DevSession,
  entry: string,
  options: DevWorkspaceOptions,
  ui: Workspace.WorkflowUI,
  reason: string,
): Promise<void> {
  state.stopKeys?.()
  await Try(async () => {
    state.workspace = await Workspace.execute({
      kind: 'preview',
      entry,
      options,
      restart: { reason, suspend: () => stopDevSession(state) },
    }, ui)
    await startDevRuntime(state)
  }, {
    catch: error => IO.warn(`Preview restart did not complete: ${String(error)}`),
    finally() {
      state.recovery = undefined
      startDevActions(state)
    },
  })
}

type DevSession = {
  stopped: boolean
  controller: Cancellation.Controller
  stopKeys?: () => void
  workspace?: Workspace.WorkflowWorkspace
  expo?: Runtime.ExpoSession
  preview?: Perf.PreviewHarness
  recovery?: Promise<void>
}

async function startDevRuntime(state: DevSession): Promise<void> {
  if (state.stopped) {
    return
  }
  const workspace = state.workspace ?? Errors.ThrowShouldNeverHappen('Preview workspace is unavailable.')
  const entryPath = workspace.files.entryPath
  if (!entryPath) {
    Errors.ThrowShouldNeverHappen('Preview did not register an entry path for preview edits.')
  }
  state.expo = await Runtime.start(workspace.runtime!, { onOutput: reportExpoOutput, signal: state.controller.signal })
  state.preview = await Perf.createPreviewHarness({
    workspace,
    preview: state.expo.url,
    sessionId: Platform.randomUUID(),
    canonicalSource: await FS.readFile(entryPath, 'utf8'),
    scenarios: Perf.previewScenarios,
    onReload: reportReload,
  })
  IO.print('Tao preview is running at ' + state.preview.url)
}

function startDevActions(state: DevSession): void {
  if (state.stopped || !Terminal.isInteractive()) {
    return
  }
  state.stopKeys?.()
  const stopKeys = Terminal.listenForKeys(key => {
    if (key === 'q' || key === ControlCCharacter) {
      requestDevExit(state)
    } else if (key === 'w') {
      openDevBrowser(state)
    } else {
      // Unassigned keys leave the running preview unchanged.
    }
  })
  state.stopKeys = () => {
    stopKeys()
    IO.setCommands([])
  }
  IO.setCommands([{ key: 'w', label: 'open web' }, { key: 'q', label: 'quit' }])
}

function openDevBrowser(state: DevSession): void {
  const url = state.preview?.url
  if (url && !state.stopped) {
    void Try(() => Browser.openUrl(url), {
      catch: error => IO.warn(`Could not open preview browser: ${String(error)}`),
    })
  }
}

function requestDevExit(state: DevSession): void {
  state.stopped = true
  state.controller.abort()
  state.stopKeys?.()
}

async function stopDevSession(state: DevSession): Promise<void> {
  state.stopKeys?.()
  if (state.workspace) {
    await cleanup({ preview: state.preview, expo: state.expo, workspace: state.workspace, reportFailure: false })
    state.workspace = undefined
    state.expo = undefined
    state.preview = undefined
  }
}

function reportSourceUpdate(result: Workspace.UpdateResult): void {
  IO.print(`Compile ${result.revision}:${NewlineCharacter}  ${CLIKit.formatTimings(result.timings)}`)
  if (result.status === 'failed') {
    IO.warn(`Preview source compilation failed: ${result.error}`)
    IO.warn('The last good app remains available.')
    return
  }
  if (result.status === 'invalid') {
    IO.warn('Preview source was not published; the last good app remains available.')
  }
}

function reportSourceError(error: unknown): void {
  IO.warn('Could not read changed source: ' + String(error))
}

type ExpoOutputStream = 'stdout' | 'stderr'
type OptionalPreview = Perf.PreviewHarness | undefined
type OptionalExpoSession = Runtime.ExpoSession | undefined

function reportExpoOutput(stream: ExpoOutputStream, text: string): void {
  IO.progress(`[expo ${stream}] ${text.trimEnd().replace('Starting project at ', 'Starting Expo runtime at ')}`)
}

function reportReload(timing: Perf.ReloadTiming): void {
  IO.print(`Reload ${timing.revision}: change observed → Metro ${timing.saveToHmrMs.toFixed(1)} ms.`)
  for (const [id, frame] of Object.entries(timing.frames)) {
    const label = id === 'left' ? 'narrow' : 'wide'
    IO.print(
      `  ${label}: publication → Metro ${frame.publishToHmrMs.toFixed(1)} ms (${
        (frame.saveToHmrMs / 1000).toFixed(4)
      } s elapsed)`
        + ` | Metro → applied ${frame.hmrToAppliedMs.toFixed(1)} ms (${
          (frame.saveToAppliedMs / 1000).toFixed(4)
        } s elapsed)`,
    )
  }
  IO.print(
    `Total ${timing.revision}: change observed → preview applied ${timing.saveToAppliedMs.toFixed(1)} ms (${
      (timing.saveToAppliedMs / 1000).toFixed(4)
    } s elapsed, both previews).`,
  )
}

type CleanupOptions = {
  preview: OptionalPreview
  workspace: Workspace.WorkspaceSession
  expo: OptionalExpoSession
  reportFailure: boolean
}

async function cleanup(options: CleanupOptions): Promise<void> {
  options.preview?.dispose()
  await Try(() => options.workspace.dispose(), {
    async finally() {
      if (options.expo) {
        await options.expo.dispose()
        if (options.reportFailure) {
          printExpoOutput(await options.expo.output())
        }
      }
    },
  })
}

function printExpoOutput(output: Exec.ProcessOutput): void {
  const messages = [output.stdout.trim(), output.stderr.trim()].filter(Boolean)
  if (messages.length) {
    IO.printToStdErr(('Expo diagnostics:' + NewlineCharacter) + messages.join(NewlineCharacter))
  }
}
