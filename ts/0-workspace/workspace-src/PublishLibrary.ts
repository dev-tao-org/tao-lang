import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform } from '@shared/os'
import { compileLibraryPackage, type LibraryPackageRequest } from './LibraryPackage'

const OwnerMarker = '.tao-library-package'

/** publishLibrary compiles a fresh generation and atomically updates only its own output link. */
export async function publishLibrary(request: LibraryPackageRequest): Promise<string> {
  const output = Path.resolve(request.out)
  const generations = output + '.generations'
  await requireOwnedOutput(output, generations)
  const generation = Path.join(generations, Platform.randomUUID())
  await compileLibraryPackage(createGenerationRequest(request, generation))
  await FileSystem.writeFile(Path.join(generation, OwnerMarker), request.name)
  await FileSystem.mkdir(Path.dirname(output))
  const target = Path.relative(Path.dirname(output), generation)
  if (FileSystem.existsSync(output)) {
    await FileSystem.replaceDirectoryLink(target, output)
  } else {
    await FileSystem.symlink(target, output, 'dir')
  }
  return output
}

function createGenerationRequest(request: LibraryPackageRequest, out: string): LibraryPackageRequest {
  return { ...request, out }
}

async function requireOwnedOutput(output: string, generations: string): Promise<void> {
  const existing = await Try.WithDefault(undefined, () => FileSystem.lstat(output))
  if (!existing) {
    return
  }
  if (!existing.isSymbolicLink()) {
    return Errors.ThrowUserInput(`Compiler output already exists and is not owned; preserved it: ${output}.`)
  }
  const target = Path.resolve(Path.dirname(output), await FileSystem.readlink(output))
  const marker = Path.join(target, OwnerMarker)
  if (!Path.isWithin(generations, target) || !FileSystem.existsSync(marker)) {
    Errors.ThrowUserInput(`Compiler output links to unrelated data; preserved it: ${output}.`)
  }
}
