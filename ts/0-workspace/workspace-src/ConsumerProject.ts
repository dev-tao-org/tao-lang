import type * as Runtime from '@runtime'
import * as Expo from '@runtime/expo'
import { Errors } from '@shared'
import { Path } from '@shared/os'
import { resolveCompileTarget } from './CompileTarget'
import { withDependencySession } from './ModuleDependencies'
import { discoverProject, ensureProjectMetadata } from './projects/Projects'
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
    await compileConsumerLibrary(manifest)
    const directory = Path.join(session.directory, 'expo')
    await Expo.createConsumerHost(createHostOptions(manifest, directory, platform))
    await run(directory)
  })
}

async function compileConsumerLibrary(manifest: TypeScriptProjectPackage): Promise<void> {
  if (!manifest.compile) {
    return
  }
  const target = await resolveCompileTarget(manifest.directory)
  if (target.kind !== 'library' || !target.out || !target.name) {
    return Errors.ThrowUserInput(
      'A React consumer tao.compile configuration must select a named TypeScript library output.',
    )
  }
  await publishLibrary({ entry: target.entry, target: target.target, out: target.out, name: target.name })
}

function createHostOptions(manifest: TypeScriptProjectPackage, directory: string, platform: Runtime.ExpoPlatform) {
  const run = manifest.run ?? Errors.ThrowUserInput('Configure tao.run.entry in the authored package.json.')
  return {
    directory,
    packageDirectory: manifest.directory,
    entry: run.entry,
    name: run.name,
    dependencies: manifest.dependencies,
    devDependencies: manifest.devDependencies,
    platform,
  }
}
