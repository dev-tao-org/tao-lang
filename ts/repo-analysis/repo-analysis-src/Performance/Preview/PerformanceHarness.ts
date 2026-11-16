import * as Runtime from '@runtime'
import { Errors, Time, Try } from '@shared'
import { Platform } from '@shared/os'
import type { ProcessOutput } from '@shared/os/exec'
import { Cancellation } from '@shared/web'
import type * as Workspace from '@workspace'

import type { ReloadTiming } from '../ReloadTimings'
import { preparePreviewEditor, type PreviewEditorWorkspace } from './PreviewEditorWorkspace'
import { createPreviewHarness, type PreviewHarness } from './PreviewHarness'
import * as PreviewMeasurement from './PreviewMeasurement'

/** PreviewOptions supplies the isolated performance project and its single compiler session. */
export type PreviewOptions = {
  workspace: Workspace.WorkspaceSession
  project: Workspace.Project
  initialSource: string
  measurement?: PreviewMeasurement.PreviewRunOptions
}

/** PerformanceHarness owns the browser shell and the on-demand Expo process for one performance project. */
export type PerformanceHarness = {
  url: string
  shellStartedAt: number
  dispose(): Promise<void>
  output(): Promise<ProcessOutput | undefined>
}

/** openPerformanceHarness stages the fixed project and serves its editor with previews initially closed. */
export async function openPerformanceHarness(
  options: PreviewOptions,
  sessionId = Platform.randomUUID(),
  onReload?: (timing: ReloadTiming) => void,
): Promise<PerformanceHarness> {
  return await Try(async () => {
    const fixture = PreviewMeasurement.createMeasurementFiles(options.initialSource)
    const editor = await preparePreviewEditor(options.workspace, options.project.directory, fixture)
    const measurement = PreviewMeasurement.readPreviewMeasurement(options.measurement)
    const shellStartedAt = Time.nowMs()
    return await startHarness(options.workspace, editor, { sessionId, fixture, measurement, shellStartedAt, onReload })
  }, {
    async catch(error) {
      await options.workspace.dispose()
      return Errors.Throw(error)
    },
  })
}

type HarnessStart = {
  sessionId: string
  fixture: PreviewMeasurement.MeasurementSource
  measurement: PreviewMeasurement.PreviewMeasurement
  shellStartedAt: number
  onReload?: (timing: ReloadTiming) => void
}
type PendingExpo = Promise<Runtime.ExpoSession> | undefined

async function startHarness(
  workspace: Workspace.WorkspaceSession,
  editor: PreviewEditorWorkspace,
  options: HarnessStart,
): Promise<PerformanceHarness> {
  const controller = Cancellation.createController()
  let pending: PendingExpo
  const harness = await createPreviewHarness({
    workspace,
    editor,
    async preview() {
      pending ??= launchPreview(workspace, editor, controller.signal).catch(error => {
        pending = undefined
        return Errors.Throw(error)
      })
      return (await pending).url
    },
    sessionId: options.sessionId,
    canonicalSource: options.fixture.entry,
    frameCount: options.measurement.frameCount,
    scenarios: PreviewMeasurement.createMeasurementScenarios(options.measurement),
    onReload: options.onReload,
  })
  return {
    url: harness.url,
    shellStartedAt: options.shellStartedAt,
    async dispose() {
      controller.abort()
      await closeHarness(workspace, editor, harness, pending)
    },
    async output() {
      const expo = await pending?.catch(() => undefined)
      return await expo?.output()
    },
  }
}

async function launchPreview(
  workspace: Workspace.WorkspaceSession,
  editor: PreviewEditorWorkspace,
  signal: Cancellation.Controller['signal'],
): Promise<Runtime.ExpoSession> {
  await editor.compileInitial()
  signal.throwIfAborted()
  const runtime = workspace.runtime ?? Errors.ThrowShouldNeverHappen('Compiled performance project has no runtime.')
  return await Runtime.start(runtime, { signal })
}

async function closeHarness(
  workspace: Workspace.WorkspaceSession,
  editor: PreviewEditorWorkspace,
  harness: PreviewHarness,
  pending: PendingExpo,
): Promise<void> {
  await Try(async () => {
    harness.dispose()
    await editor.close()
    const expo = await pending?.catch(() => undefined)
    await expo?.dispose()
  }, { finally: () => workspace.dispose() })
}
