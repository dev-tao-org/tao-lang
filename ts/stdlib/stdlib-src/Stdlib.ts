import { Json, UserInput } from '@shared'
import { NewlineCharacter, Regxs, Try } from '@shared'
import { FS, Path, Platform, Storage } from '@shared/os'
import ProjectIgnore from './.tao/.gitignore' with { type: 'text' }
import ProjectMetadata from './.tao/store/project.json' with { type: 'json' }
import UI from './@ui/Views.tao' with { type: 'text' }

/** projectDirectory returns the live stdlib project or a packaged project cache path. */
export function projectDirectory(): Promise<string> {
  return defaultProjectDirectory ??= resolveDefaultProjectDirectory()
}

type CachedProjectDirectory = Promise<string> | undefined
type CandidateProjectDirectory = string | undefined
type StdlibResourceFiles = Readonly<Record<string, string>>
type StdlibResourceEntries = [string, string][]

let defaultProjectDirectory: CachedProjectDirectory

const embeddedFiles = {
  '@ui/Views.tao': UI,
  '.tao/.gitignore': ProjectIgnore,
  '.tao/store/project.json': serializeEmbeddedProjectMetadata(ProjectMetadata),
}

function serializeEmbeddedProjectMetadata(metadata: typeof ProjectMetadata): string {
  return `${Json.Print(metadata)}${NewlineCharacter}`
}

async function resolveDefaultProjectDirectory(): Promise<string> {
  const candidate = Path.dirname(Path.fileURLToPath(import.meta.url))
  return await locateProject(candidate, Storage.resolveCacheDirectory('stdlib'), embeddedFiles)
}

async function locateProject(
  candidate: CandidateProjectDirectory,
  cacheRoot: string,
  resources: StdlibResourceFiles,
): Promise<string> {
  const live = findLiveProjectRoot(candidate)
  return live ?? await Storage.withCacheMutation(() => materializeProject(cacheRoot, resources))
}

function findLiveProjectRoot(candidate: CandidateProjectDirectory): string | undefined {
  if (!candidate || !FS.existsSync(Path.join(candidate, '.tao', 'store', 'project.json'))) {
    return undefined
  }
  return Try.WithDefault(undefined, () => FS.realpathSync(candidate))
}

async function materializeProject(cacheRoot: string, resources: StdlibResourceFiles): Promise<string> {
  const entries = Object.entries(resources).sort(([left], [right]) => left.localeCompare(right))
  validateResources(entries)
  await FS.mkdir(cacheRoot)
  const fingerprint = Platform.hashText(serializeStdlibResourceEntries(entries))
  const root = Path.resolve(cacheRoot, `project-${fingerprint}`)
  const marker = Path.join(root, '.ready')
  if (await isReadyProject(root, marker, fingerprint, cacheRoot, entries)) {
    return root
  }
  const staging = `${root}.${Platform.randomUUID()}.pending`
  await FS.mkdir(staging)
  await Try(async () => {
    await writeResources(staging, entries)
    await FS.writeFile(Path.join(staging, '.ready'), `${fingerprint}${NewlineCharacter}`)
    await replaceIncompleteRoot(root, cacheRoot)
    await FS.rename(staging, root)
  }, { finally: () => FS.rm(staging, { recursive: true, force: true }) })
  return root
}

function serializeStdlibResourceEntries(entries: StdlibResourceEntries): string {
  return Json.Print(entries)
}

function validateResources(entries: StdlibResourceEntries): void {
  UserInput.require(
    !(entries.length === 0 || entries.some(([path]) => {
      return Path.isAbsolute(path)
        || path.split(Regxs.PathSeparatorRegx).some(part => !part || part === '.' || part === '..')
    })),
    'Embedded stdlib project contains an unsafe resource path.',
  )
}

async function isReadyProject(
  root: string,
  marker: string,
  fingerprint: string,
  cacheRoot: string,
  entries: StdlibResourceEntries,
): Promise<boolean> {
  if (!await FS.exists(root)) {
    return false
  }
  assertContainedPath(root, cacheRoot)
  if (!await FS.exists(marker)) {
    return false
  }
  assertContainedPath(marker, root)
  if ((await FS.readFile(marker, 'utf8')).trim() !== fingerprint) {
    return false
  }
  return await resourcesMatch(root, entries)
}

async function resourcesMatch(root: string, entries: StdlibResourceEntries): Promise<boolean> {
  for (const [relative, contents] of entries) {
    const path = Path.resolve(root, ...relative.split('/'))
    if (!await FS.exists(path)) {
      return false
    }
    assertContainedPath(path, root)
    if (await FS.readFile(path, 'utf8') !== contents) {
      return false
    }
  }
  return true
}

async function writeResources(staging: string, entries: StdlibResourceEntries): Promise<void> {
  for (const [relative, contents] of entries) {
    const target = Path.resolve(staging, ...relative.split('/'))
    const parent = Path.dirname(target)
    await FS.mkdir(parent)
    assertContainedPath(parent, staging)
    await FS.writeFile(target, contents)
  }
}

async function replaceIncompleteRoot(root: string, cacheRoot: string): Promise<void> {
  if (!await FS.exists(root)) {
    return
  }
  assertContainedPath(root, cacheRoot)
  await FS.rm(root, { recursive: true, force: true })
}

function assertContainedPath(path: string, parent: string): void {
  const resolvedParent = Try.WithDefault(undefined, () => FS.realpathSync(parent))
  const canonicalPath = Try.WithDefault(undefined, () => FS.realpathSync(path))
  if (!resolvedParent || !canonicalPath || !Path.isWithin(resolvedParent, canonicalPath)) {
    UserInput.fail(`Stdlib project cache path escapes its cache root: ${path}`)
  }
}
