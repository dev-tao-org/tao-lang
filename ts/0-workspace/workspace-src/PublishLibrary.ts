import { Errors, Try } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import type { CompileTarget } from './CompileTarget'
import { compileLibraryPackage, type LibraryPackageRequest } from './LibraryPackage'
import type { ProjectSession } from './projects/Sessions'
import { publishDirectory } from './PublishDirectory'

/** publishLibrary compiles into the caller's locked session without changing another session's library. */
export async function publishLibrary(target: CompileTarget, session: ProjectSession): Promise<string> {
  const request = createSessionLibraryRequest(target, session)
  const output = request.out
  const generations = output + '.generations'
  await requireOutputDirectory(Path.dirname(output))
  await requireOutputDirectory(output)
  await requireOutputDirectory(generations)
  const generation = Path.join(generations, Platform.randomUUID())
  await compileLibraryPackage(createGenerationRequest(request, generation))
  await publishDirectory(generation, output)
  return output
}

function createSessionLibraryRequest(target: CompileTarget, session: ProjectSession): LibraryPackageRequest {
  if (target.kind !== 'library' || !target.target || !target.name) {
    Errors.ThrowUserInput('Select a ts-library and configure tao.compile.name in the authored package.json.')
  }
  const libraries = Path.join(session.directory, 'libraries')
  const out = Path.join(libraries, target.target)
  if (Path.dirname(out) !== libraries) {
    Errors.ThrowUserInput(`Invalid library target name: ${target.target}`)
  }
  return { entry: target.entry, target: target.target, name: target.name, out }
}

function createGenerationRequest(request: LibraryPackageRequest, out: string): LibraryPackageRequest {
  return { ...request, out }
}

async function requireOutputDirectory(output: string): Promise<void> {
  const existing = await Try.WithDefault(undefined, () => FS.lstat(output))
  if (!existing) {
    return
  }
  if (!existing.isDirectory() || existing.isSymbolicLink()) {
    return Errors.ThrowUserInput(`Compiler output is not a regular directory; preserved it: ${output}.`)
  }
}
