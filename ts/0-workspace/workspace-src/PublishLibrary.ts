import * as Runtime from '@runtime'
import { Try, UserInput } from '@shared'
import { FS, Path, Platform } from '@shared/os'
import type { CompileTarget } from './CompileTarget'
import { compileLibraryPackage, type LibraryPackageRequest } from './LibraryPackage'
import type { ProjectSession } from './projects/Sessions'
import { publishDirectory } from './PublishDirectory'

/** publishLibrary builds an explicit artifact or replaces only the caller's locked session library. */
export async function publishLibrary(
  target: CompileTarget,
  session: ProjectSession,
  destination?: string,
): Promise<string> {
  const request = createSessionLibraryRequest(target, session)
  if (destination !== undefined) {
    await linkLibraryRuntime(session)
    return await compileLibraryPackage(createGenerationRequest(request, destination))
  }
  const output = request.out
  const generations = output + '.generations'
  await requireOutputDirectory(Path.dirname(output))
  await requireOutputDirectory(output)
  await requireOutputDirectory(generations)
  await linkLibraryRuntime(session)
  const generation = Path.join(generations, Platform.randomUUID())
  await compileLibraryPackage(createGenerationRequest(request, generation))
  await publishDirectory(generation, output)
  return output
}

async function linkLibraryRuntime(session: ProjectSession): Promise<void> {
  const root = Path.dirname(Path.dirname(session.directory))
  const link = Path.join(root, 'runtime-package')
  const target = Runtime.libraryRuntimePackageDirectory()
  const existing = await Try.WithDefault(undefined, () => FS.lstat(link))
  if (existing && !existing.isSymbolicLink()) {
    UserInput.Fail(`Compiler runtime path is not a symbolic link; preserved it: ${link}.`)
  }
  if (Try.WithDefault(undefined, () => FS.realpathSync(link)) !== target) {
    await FS.replaceDirectoryLink(target, link)
  }
}

function createSessionLibraryRequest(target: CompileTarget, session: ProjectSession): LibraryPackageRequest {
  UserInput.Require(
    !(target.kind !== 'library' || !target.target || !target.name),
    'Select a ts-library and configure tao.compile.name in the authored package.json.',
  )
  const libraries = Path.join(session.directory, 'libraries')
  const out = Path.join(libraries, target.target)
  UserInput.Require(Path.dirname(out) === libraries, `Invalid library target name: ${target.target}`)
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
    return UserInput.Fail(`Compiler output is not a regular directory; preserved it: ${output}.`)
  }
}
