import { IO } from '@cli-kit'
import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Platform, Repo } from '@shared/os'
import { createProject, createWorkspace, type UpdateResult } from '@workspace/Workspace'
import { createExpoSession, type ExpoSession } from '../../../../0-workspace/workspace-src/Expo'
import { createPreviewHarness, type PreviewHarness } from '../../../../perf/perf-src/PreviewHarness'
import * as Browser from '../../../../shared/shared-src/os/Browser'
import * as Lifecycle from '../../../../shared/shared-src/os/ProcessLifecycle'
import * as WorkspaceWatch from '../../../../shared/shared-src/os/WorkspaceWatch'
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
  const source = await FileSystem.readFile(sourcePath, 'utf8')
  const project = await createProject({ directory: Artifacts.resolvePath('dev/hello-world'), persistent: true })
  const workspace = createWorkspace({ project })
  let expo: ExpoSession | undefined
  let preview: PreviewHarness | undefined
  let stopWatching: (() => void) | undefined
  await Try(async () => {
    requirePublished(await workspace.update(source))
    expo = await createExpoSession(project, { onOutput: reportExpoOutput })
    preview = await createPreviewHarness({
      workspace,
      previewUrl: expo.url,
      initialSource: source,
      sessionId: Platform.randomUUID(),
    })
    stopWatching = WorkspaceWatch.watchFile(sourcePath, () => refreshSource(sourcePath, workspace))
    await Browser.openUrl(preview.url)
    IO.print('Tao preview is running at ' + preview.url)
    IO.print('Edit Apps/Tests/Hello World.tao to refresh both previews. Press Ctrl-C to stop.')
    await Lifecycle.waitForTermination()
  }, {
    finally(_thrown, error) {
      return cleanup({ stopWatching, preview, workspace, expo, reportFailure: Boolean(error) })
    },
  })
}

function refreshSource(path: string, workspace: ReturnType<typeof createWorkspace>): void {
  void publishSource(path, workspace)
}

async function publishSource(path: string, workspace: ReturnType<typeof createWorkspace>): Promise<void> {
  const result = await Try(() => workspace.updateFile(path), {
    catch() {
      return undefined
    },
  })
  if (!result || result.status === 'invalid' || result.status === 'failed') {
    IO.warn('Preview source was not published; the last good app remains available.')
  }
}

function requirePublished(result: UpdateResult): void {
  if (result.status !== 'published') {
    Errors.ThrowUnexpected('Hello World source did not compile for the live preview: ' + result.status)
  }
}

function reportExpoOutput(stream: 'stdout' | 'stderr', text: string): void {
  IO.progress(`[expo ${stream}] ${text.trimEnd()}`)
}

async function cleanup(options: {
  stopWatching: (() => void) | undefined
  preview: PreviewHarness | undefined
  workspace: ReturnType<typeof createWorkspace>
  expo: ExpoSession | undefined
  reportFailure: boolean
}): Promise<void> {
  options.stopWatching?.()
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
