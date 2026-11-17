import { Errors, Try, UserInput } from '@shared'
import { Files, FS, Path } from '@shared/os'
import { libraryProjectFiles } from './LibraryProjectTemplate'
import { initializeProject, type ProjectLayout } from './Projects'

/** initializeLibraryProject scaffolds a Tao library and React consumer in an existing folder. */
export async function initializeLibraryProject(path: string): Promise<ProjectLayout> {
  const root = await resolveExistingDirectory(path)
  await preflightLibraryProject(root)
  const project = await initializeProject(root)
  for (const file of libraryProjectFiles) {
    const destination = Path.join(root, file.path)
    await FS.mkdir(Path.dirname(destination))
    await FS.nativeFileSystemPromises.writeFile(destination, file.contents, { flag: 'wx' })
  }
  return project
}

async function resolveExistingDirectory(path: string): Promise<string> {
  const absolute = Path.resolve(path)
  const info = await Try(() => FS.lstat(absolute), {
    catch(error) {
      if (isMissingPath(error)) {
        UserInput.fail(`A Tao library project target must be an existing directory: ${absolute}`)
      }
      Errors.Throw(error)
    },
  })
  if (!info.isDirectory()) {
    UserInput.fail(`A Tao library project target must be an existing directory: ${absolute}`)
  }
  return await FS.realpath(absolute)
}

async function preflightLibraryProject(root: string): Promise<void> {
  const taoDirectory = Path.join(root, '.tao')
  if (await hasPathEntry(taoDirectory)) {
    UserInput.fail(`A Tao project marker already exists at ${taoDirectory}`)
  }
  const nestedProject = await Files.findProjectMarker(root)
  if (nestedProject) {
    UserInput.fail(`Cannot initialize a Tao project containing another project at ${Path.dirname(nestedProject)}`)
  }
  await requireDirectories(root, ['src', 'src/tao', 'src/ts'])
  for (const file of libraryProjectFiles) {
    const destination = Path.join(root, file.path)
    if (await hasPathEntry(destination)) {
      UserInput.fail(`Tao library scaffolding would overwrite an existing path: ${destination}`)
    }
  }
}

async function hasPathEntry(path: string): Promise<boolean> {
  const entry = await Try(() => FS.lstat(path), {
    catch(error) {
      if (isMissingPath(error)) {
        return undefined
      }
      Errors.Throw(error)
    },
  })
  return entry !== undefined
}

async function requireDirectories(root: string, relativeDirectories: string[]): Promise<void> {
  for (const relative of relativeDirectories) {
    const path = Path.join(root, relative)
    if (await hasPathEntry(path) && !FS.lstatSync(path).isDirectory()) {
      UserInput.fail(`Tao library scaffolding requires a directory at ${path}`)
    }
  }
}

function isMissingPath(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  return 'code' in error && error.code === 'ENOENT'
}
