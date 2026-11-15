import { IO } from '@cli-kit'
import * as CLIKit from '@cli-kit'
import * as Runtime from '@runtime'
import { Errors, NewlineCharacter, Try } from '@shared'
import { FS, Platform, Repo } from '@shared/os'
import type { Cancellation } from '@shared/web'
import * as Workspace from '@workspace'

import * as Perf from '@perf'

import { prepareRuntime } from '../../cli-checks/runtime-build'
/** startDevelopmentPreview opens the live Preview app until its launcher disposes it. */
export async function startDevelopmentPreview(signal: Cancellation.Controller['signal'], ui: Workspace.WorkflowUI) {
  await prepareRuntime()
  const entry = Repo.resolvePath('Apps/Dev/Preview/Preview.tao')
  const state: DevSession = { stopped: false, signal }
  const options = devWorkspaceOptions(state, entry, ui)
  return await Try(async () => {
    state.workspace = await Workspace.execute({ kind: 'preview', entry, options }, ui)
    await startDevRuntime(state)
    IO.print('Edit Apps/Dev/Preview/Preview.tao to refresh both previews.')
    return {
      get url() {
        return state.preview?.url
      },
      get stopped() {
        return !state.preview && !state.recovery
      },
      dispose: () => closeDevelopmentPreview(state),
    }
  }, {
    async catch(error) {
      await closeDevelopmentPreview(state)
      return Errors.Throw(error)
    },
  })
}

async function closeDevelopmentPreview(state: DevSession): Promise<void> {
  state.stopped = true
  await state.recovery
  await stopDevSession(state)
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
      if (canRecoverSetup && !state.recovery && !state.stopped) {
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
  await Try(async () => {
    state.workspace = await Workspace.execute({
      kind: 'preview',
      entry,
      options,
      restart: { reason, suspend: () => stopDevSession(state) },
    }, ui)
    await startDevRuntime(state)
  }, {
    async catch(error) {
      IO.warn(`Preview restart did not complete: ${String(error)}`)
      if (!state.preview) {
        await stopDevSession(state)
      }
    },
    finally() {
      state.recovery = undefined
    },
  })
}

type DevSession = {
  stopped: boolean
  signal: Cancellation.Controller['signal']
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
  state.expo = await Runtime.start(workspace.runtime!, { onOutput: reportExpoOutput, signal: state.signal })
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

async function stopDevSession(state: DevSession): Promise<void> {
  const { workspace, preview, expo } = state
  state.workspace = undefined
  state.expo = undefined
  state.preview = undefined
  if (workspace) {
    await cleanup({ preview, expo, workspace })
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
}

async function cleanup(options: CleanupOptions): Promise<void> {
  options.preview?.dispose()
  await Try(() => options.workspace.dispose(), {
    async finally() {
      if (options.expo) {
        await options.expo.dispose()
      }
    },
  })
}
