import { formatTimings, IO } from '@cli-kit'
import * as Runtime from '@runtime/Runtime'
import { Errors, Try } from '@shared'
import { Browser, FileSystem, Lifecycle, Platform, Repo } from '@shared/os'
import { openProjectWorkspace } from '@workspace/ProjectWorkspace'
import { createWorkspace, type UpdateResult } from '@workspace/Workspace'
import { createPreviewHarness, type PreviewHarness } from '../../../../perf/perf-src/PreviewHarness'
import { previewScenarios } from '../../../../perf/perf-src/PreviewScenarios'
import type { ReloadTiming } from '../../../../perf/perf-src/ReloadTimings'
import { prepareRuntime } from '../../cli-checks/runtime-build'
import { registerCommand } from './_command-runner'

/** devCommand runs the isolated Preview fixture in a persistent dual-preview Expo session. */
export default registerCommand({
  name: 'dev',
  description: 'Run the Preview fixture in two live previews and refresh after each button edit.',
  async action() {
    await runDevSession()
  },
})

async function runDevSession(): Promise<void> {
  await prepareRuntime()
  const entry = Repo.resolvePath('Apps/Dev/Preview/Preview.tao')
  const workspace = await openProjectWorkspace(entry, {
    kind: 'studio',
    onSourceUpdate: reportSourceUpdate,
    onSourceError: reportSourceError,
  })
  let expo: Runtime.ExpoSession | undefined
  let preview: PreviewHarness | undefined
  await Try(async () => {
    IO.progress('Opening workspace at ' + workspace.directory)
    requirePublished(await workspace.openFile(entry))
    const entryPath = workspace.files.entryPath
      ?? Errors.ThrowUnexpected('Preview did not register an entry path for preview edits.')
    const canonicalSource = await FileSystem.readFile(entryPath, 'utf8')
    expo = await Runtime.start(workspace.runtime!, { onOutput: reportExpoOutput })
    preview = await createPreviewHarness({
      workspace,
      previewUrl: expo.url,
      sessionId: Platform.randomUUID(),
      canonicalSource,
      scenarios: previewScenarios,
      onReload: reportReload,
    })
    IO.print('Tao preview is running at ' + preview.url)
    await Browser.openUrl(preview.url)
    IO.print('Edit Apps/Dev/Preview/Preview.tao to refresh both previews. Press Ctrl-C to stop.')
    await Lifecycle.waitForTermination()
  }, {
    finally: (_thrown, error) => cleanup({ preview, workspace, expo, reportFailure: Boolean(error) }),
  })
}

function reportSourceUpdate(result: UpdateResult): void {
  IO.print(`Compile ${result.revision}:\n  ${formatTimings(result.timings)}`)
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

function requirePublished(result: UpdateResult): void {
  if (result.status !== 'published') {
    Errors.ThrowUnexpected('Preview source did not compile for the live preview: ' + result.status)
  }
}

function reportExpoOutput(stream: 'stdout' | 'stderr', text: string): void {
  IO.progress(`[expo ${stream}] ${text.trimEnd().replace('Starting project at ', 'Starting Expo runtime at ')}`)
}

function reportReload(timing: ReloadTiming): void {
  IO.print(
    `Reload ${timing.revision}: change observed → Metro ${timing.saveToHmrMs.toFixed(1)} ms.`,
  )
  for (const [id, frame] of Object.entries(timing.frames)) {
    const label = id === 'left' ? 'narrow' : 'wide'
    IO.print(
      `  ${label}: write → Metro ${frame.publishToHmrMs.toFixed(1)} ms (${
        (frame.saveToHmrMs / 1000).toFixed(4)
      } s elapsed)`
        + ` | Metro → applied ${frame.hmrToAppliedMs.toFixed(1)} ms (${
          (frame.saveToAppliedMs / 1000).toFixed(4)
        } s elapsed)`,
    )
  }
  IO.print(
    `Total ${timing.revision}: save → repaint (preview applied) ${timing.saveToAppliedMs.toFixed(1)} ms (${
      (timing.saveToAppliedMs / 1000).toFixed(4)
    } s elapsed, both previews).`,
  )
}

async function cleanup(options: {
  preview: PreviewHarness | undefined
  workspace: ReturnType<typeof createWorkspace>
  expo: Runtime.ExpoSession | undefined
  reportFailure: boolean
}): Promise<void> {
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

function printExpoOutput(output: Awaited<ReturnType<Runtime.ExpoSession['output']>>): void {
  const messages = [output.stdout.trim(), output.stderr.trim()].filter(Boolean)
  if (messages.length) {
    IO.printToStdErr('Expo diagnostics:\n' + messages.join('\n'))
  }
}
