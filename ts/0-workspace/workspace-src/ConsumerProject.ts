import * as Expo from '@runtime/expo'
import { Errors } from '@shared'
import { FS, Path } from '@shared/os'
import { type CompileTarget, resolveCompileTarget } from './CompileTarget'
import { linkConsumerBuildDependencies, prepareConsumerDependencies } from './ConsumerDependencies'
import { withDependencySession } from './ModuleDependencies'
import { discoverProject, ensureProjectMetadata } from './projects/Projects'
import type { ProjectSession } from './projects/Sessions'
import { publishLibrary } from './PublishLibrary'
import { readTypeScriptProjectPackage, type TypeScriptProjectPackage } from './TypeScriptProjectPackage'
import type { WorkflowUI } from './Workflow'

type ConsumerSessionId = string | undefined

/** withConsumerProject compiles the configured library and holds its normal project session while the host runs. */
export async function withConsumerProject(
  packageDirectory: string,
  sessionId: ConsumerSessionId,
  run: (directory: string) => Promise<void>,
  ui?: WorkflowUI,
): Promise<void> {
  const manifest = await readTypeScriptProjectPackage(packageDirectory)
  const project = await discoverProject(packageDirectory)
  if (!project) {
    Errors.ThrowUserInput(`No Tao project owns ${packageDirectory}. Run tao init <project-directory>.`)
  }
  await ensureProjectMetadata(project.root)
  await withDependencySession(project.root, sessionId, async session => {
    const library = await compileConsumerLibrary(manifest, project.root, session, ui)
    const directory = Path.join(session.directory, 'expo')
    await Expo.createConsumerHost(createHostOptions(manifest, directory, library))
    await run(directory)
  })
}

/** publishConsumerLibrary prepares the authored dependencies and makes them visible in the local output. */
export async function publishConsumerLibrary(
  target: CompileTarget,
  packageDirectory: string,
  projectRoot: string,
  session: ProjectSession,
  ui?: WorkflowUI,
): Promise<string> {
  const manifest = await readTypeScriptProjectPackage(packageDirectory)
  return await publishPreparedLibrary(target, manifest, projectRoot, session, ui)
}

async function publishPreparedLibrary(
  target: CompileTarget,
  manifest: TypeScriptProjectPackage,
  projectRoot: string,
  session: ProjectSession,
  ui?: WorkflowUI,
): Promise<string> {
  const directory = await publishLibrary(target, session)
  if (ui) {
    await prepareDefaultLibraryInput(target, manifest, projectRoot, directory)
    await prepareConsumerDependencies(manifest, ui)
  }
  await linkConsumerBuildDependencies(manifest.directory, directory)
  return directory
}

type OptionalConsumerLibrary = Expo.ConsumerLibrary | undefined

async function compileConsumerLibrary(
  manifest: TypeScriptProjectPackage,
  projectRoot: string,
  session: ProjectSession,
  ui?: WorkflowUI,
): Promise<OptionalConsumerLibrary> {
  if (!manifest.compile) {
    if (ui) {
      await prepareConsumerDependencies(manifest, ui)
    }
    return
  }
  const target = await resolveCompileTarget(manifest.directory)
  if (target.kind !== 'library' || !target.name) {
    return Errors.ThrowUserInput(
      'A React consumer tao.compile configuration must select a named TypeScript library output.',
    )
  }
  const directory = await publishPreparedLibrary(target, manifest, projectRoot, session, ui)
  return { name: target.name, directory }
}

async function prepareDefaultLibraryInput(
  target: CompileTarget,
  manifest: TypeScriptProjectPackage,
  projectRoot: string,
  published: string,
): Promise<void> {
  const specification = target.name === undefined ? undefined : manifest.dependencies[target.name]
  if (!specification?.startsWith('file:')) {
    return
  }
  const requested = Path.resolve(manifest.directory, specification.slice('file:'.length))
  if (requested === published || FS.existsSync(Path.join(requested, 'package.json'))) {
    return
  }
  const project = await ensureProjectMetadata(projectRoot)
  const defaultOutput = Path.join(project.sessionsDirectory, '.cli', 'libraries', target.target!)
  if (requested === defaultOutput) {
    await withDependencySession(projectRoot, undefined, session => publishLibrary(target, session))
  }
}

function createHostOptions(manifest: TypeScriptProjectPackage, directory: string, library: OptionalConsumerLibrary) {
  const run = manifest.run ?? Errors.ThrowUserInput('Configure tao.run.entry in the authored package.json.')
  return {
    directory,
    packageDirectory: manifest.directory,
    entry: run.entry,
    name: run.name,
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    library,
  }
}
