import * as CLIKit from '@cli-kit'
import * as Runtime from '@runtime'
import { Errors } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { workspaceTests } from '../../cli-checks/check'
import { registerCommand } from './_command-runner'
import check from './check'
import compile from './compile'
import fmt from './fmt'

/** verifyCommand fixes, checks and tests the new workspace. */
export default registerCommand({
  name: 'verify',
  description: 'Format, regenerate and typecheck review builds, then check and test the workspace.',
  arguments: [{
    name: 'format-paths',
    description: 'Limit formatting to named files or globs; checks stay workspace-wide.',
    variadic: true,
  }],
  options: [{ flags: '--yes', description: 'Authorize required app dependency setup.' }],
  async action(paths: string[], options: { yes?: boolean } = {}) {
    // Native app journeys await their testing implementation.
    await CLIKit.runSteps(
      () => fmt.action(paths),
      () => verifyReviewBuilds(options),
      () => check.action(),
      () => workspaceTests([], undefined, { yes: options.yes }),
    )
  },
})

async function verifyReviewBuilds(options: { yes?: boolean }): Promise<void> {
  await CLIKit.runSteps(
    () =>
      compile.action(Repo.resolvePath(KitchenSink), {
        session: ReviewSession,
        yes: options.yes,
      }),
    () => compile.action('Demo', { package: Repo.resolvePath(LibraryConsumer), session: ReviewSession }),
    () => checkReviewBuild(KitchenSinkBuild),
    prepareReviewLibraryPeers,
    () => checkReviewBuild(DemoLibrarySource),
  )
}

const ReviewSession = 'review-build'
const KitchenSink = 'Apps/Dev/Kitchen Sink/Kitchen Sink.tao'
const LibraryConsumer = 'Apps/TS Lib App/src/ts'
const KitchenSinkBuild = `Apps/Dev/.tao/cache/sessions/${ReviewSession}/build`
const ReviewLibraries = `Apps/TS Lib App/.tao/cache/sessions/${ReviewSession}/libraries`
const DemoLibrarySource = `${ReviewLibraries}/Demo/ts`

async function prepareReviewLibraryPeers(): Promise<void> {
  const dependencies = Repo.resolvePath('ts/7-runtime')
  const modules = Repo.resolvePath(`${ReviewLibraries}/node_modules`)
  const runtime = Path.join(modules, Runtime.RuntimeLibraryPackageName)
  await FS.mkdir(Path.dirname(runtime))
  await FS.replaceDirectoryLink(Runtime.libraryRuntimePackageDirectory(), runtime)
  for (const name of ['react', 'react-native', '@types/react', '@preact/signals-core', 'zod']) {
    const source = FS.resolvePackageDirectory(name, dependencies)
    if (source === undefined) {
      Errors.ThrowHostEnvironment(`Missing pinned library review dependency: ${name}.`)
    }
    const target = Path.join(modules, name)
    await FS.mkdir(Path.dirname(target))
    await FS.replaceDirectoryLink(source, target)
  }
}

async function checkReviewBuild(directory: string): Promise<void> {
  const config = Path.join(directory, 'tsconfig.json')
  await CLIKit.runNonInteractiveCommand('tsc', ['--project', config, '--noEmit'], {
    cwd: Repo.getWorkspaceRoot(),
  })
}
