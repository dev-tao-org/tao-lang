import { formatTimings, IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Artifacts, Browser, Lifecycle, Platform, Repo } from '@shared/os'
import { createProject, createWorkspace, type UpdateResult } from '@workspace/Workspace'
import { createExpoSession, type ExpoSession } from '../../../../0-workspace/workspace-src/Expo'
import { createPreviewHarness, type PreviewHarness } from '../../../../perf/perf-src/PreviewHarness'
import type { ReloadTiming } from '../../../../perf/perf-src/ReloadTimings'
import { registerCommand } from './_command-runner'

/** devCommand runs the authored Hello World fixture in a persistent dual-preview Expo session. */
export default registerCommand({
  name: 'dev',
  description: 'Run the Hello World fixture in two live previews and refresh after source edits.',
  async action() {
    await runDevSession()
  },
})

async function runDevSession(): Promise<void> {
  const sourcePath = Repo.resolvePath('Apps/Tests/Hello World.tao')
  const project = await createProject({ directory: Artifacts.resolvePath('dev/hello-world'), persistent: true })
  const workspace = createWorkspace({ project, onSourceUpdate: reportSourceUpdate, onSourceError: reportSourceError })
  let expo: ExpoSession | undefined
  let preview: PreviewHarness | undefined
  await Try(async () => {
    requirePublished(await workspace.openFile(sourcePath))
    expo = await createExpoSession(project, { onOutput: reportExpoOutput })
    preview = await createPreviewHarness({
      workspace,
      previewUrl: expo.url,
      sessionId: Platform.randomUUID(),
      onReload: reportReload,
    })
    IO.print('Tao preview is running at ' + preview.url)
    await Browser.openUrl(preview.url)
    IO.print('Edit Apps/Tests/Hello World.tao to refresh both previews. Press Ctrl-C to stop.')
    await Lifecycle.waitForTermination()
  }, {
    finally(_thrown, error) {
      return cleanup({ preview, workspace, expo, reportFailure: Boolean(error) })
    },
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
    Errors.ThrowUnexpected('Hello World source did not compile for the live preview: ' + result.status)
  }
}

function reportExpoOutput(stream: 'stdout' | 'stderr', text: string): void {
  IO.progress(`[expo ${stream}] ${text.trimEnd()}`)
}

function reportReload(timing: ReloadTiming): void {
  IO.print(
    `Reload ${timing.revision}: change observed → Metro ${timing.saveToHmrMs.toFixed(1)} ms; `
      + `reload complete ${timing.saveToAppliedMs.toFixed(1)} ms (${
        (timing.saveToAppliedMs / 1000).toFixed(4)
      } s elapsed, both previews).`,
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
}

async function cleanup(options: {
  preview: PreviewHarness | undefined
  workspace: ReturnType<typeof createWorkspace>
  expo: ExpoSession | undefined
  reportFailure: boolean
}): Promise<void> {
  options.preview?.dispose()
  options.workspace.dispose()
  if (options.expo) {
    await options.expo.dispose()
    if (options.reportFailure) {
      printExpoOutput(await options.expo.output())
    }
  }
}

function printExpoOutput(output: Awaited<ReturnType<ExpoSession['output']>>): void {
  const messages = [output.stdout.trim(), output.stderr.trim()].filter(Boolean)
  if (messages.length) {
    IO.printToStdErr('Expo diagnostics:\n' + messages.join('\n'))
  }
}
