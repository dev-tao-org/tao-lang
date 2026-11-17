import type * as Runtime from '@runtime'
import * as Expo from '@runtime/expo'
import { Errors } from '@shared'
import { Path } from '@shared/os'
import { resolveCompileTarget } from './CompileTarget'
import { withDependencySession } from './ModuleDependencies'
import { discoverProject, ensureProjectMetadata } from './projects/Projects'
import type { ProjectSession } from './projects/Sessions'
import { publishLibrary } from './PublishLibrary'
import { readTypeScriptProjectPackage, type TypeScriptProjectPackage } from './TypeScriptProjectPackage'

type ConsumerSessionId = string | undefined

/** withConsumerProject compiles the configured library and holds its normal project session while the host runs. */
export async function withConsumerProject(
  packageDirectory: string,
  sessionId: ConsumerSessionId,
  run: (directory: string) => Promise<void>,
  platform: Runtime.ExpoPlatform = 'web',
): Promise<void> {
  const manifest = await readTypeScriptProjectPackage(packageDirectory)
  const project = await discoverProject(packageDirectory)
  if (!project) {
    Errors.ThrowUserInput(`No Tao project owns ${packageDirectory}. Run tao init <project-directory>.`)
  }
  await ensureProjectMetadata(project.root)
  await withDependencySession(project.root, sessionId, async session => {
    const library = await compileConsumerLibrary(manifest, session)
    const directory = Path.join(session.directory, 'expo')
    await Expo.createConsumerHost(createHostOptions(manifest, directory, platform, library))
    await run(directory)
  })
}

type OptionalConsumerLibrary = Expo.ConsumerLibrary | undefined

async function compileConsumerLibrary(
  manifest: TypeScriptProjectPackage,
  session: ProjectSession,
): Promise<OptionalConsumerLibrary> {
  if (!manifest.compile) {
    return
  }
  const target = await resolveCompileTarget(manifest.directory)
  if (target.kind !== 'library' || !target.name) {
    return Errors.ThrowUserInput(
      'A React consumer tao.compile configuration must select a named TypeScript library output.',
    )
  }
  const directory = await publishLibrary(target, session)
  return { name: target.name, directory }
}

function createHostOptions(
  manifest: TypeScriptProjectPackage,
  directory: string,
  platform: Runtime.ExpoPlatform,
  library: OptionalConsumerLibrary,
) {
  const run = manifest.run ?? Errors.ThrowUserInput('Configure tao.run.entry in the authored package.json.')
  return {
    directory,
    packageDirectory: manifest.directory,
    entry: run.entry,
    name: run.name,
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    platform,
    library,
  }
}
