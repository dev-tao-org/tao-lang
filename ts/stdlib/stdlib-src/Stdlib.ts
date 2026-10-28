import { Errors, Regxs, Try } from '@shared'
import { FileSystem, Path, Platform, Storage } from '@shared/os'
import ProjectIgnore from './.tao/.gitignore' with { type: 'text' }
import ProjectMetadata from './.tao/store/project.json' with { type: 'json' }
import UI from './@ui/Views.tao' with { type: 'text' }

/** projectDirectory returns the live stdlib project or a packaged project cache path. */
export function projectDirectory(): Promise<string> {
  return defaultProjectDirectory ??= resolveDefaultProjectDirectory()
}

type CachedProjectDirectory = Promise<string> | undefined
type CandidateProjectDirectory = string | undefined

let defaultProjectDirectory: CachedProjectDirectory

const embeddedFiles = {
  '@ui/Views.tao': UI,
  '.tao/.gitignore': ProjectIgnore,
  '.tao/store/project.json': `${JSON.stringify(ProjectMetadata, null, 2)}\n`,
}

async function resolveDefaultProjectDirectory(): Promise<string> {
  const candidate = Path.dirname(Path.fileURLToPath(import.meta.url))
  return await locateProject(candidate, Storage.resolveCacheDirectory('stdlib'), embeddedFiles)
}

async function locateProject(
  candidate: CandidateProjectDirectory,
  cacheRoot: string,
  resources: Readonly<Record<string, string>>,
): Promise<string> {
  const live = findLiveProjectRoot(candidate)
  return live ?? await Storage.withCacheMutation(() => materializeProject(cacheRoot, resources))
}

function findLiveProjectRoot(candidate: CandidateProjectDirectory): string | undefined {
  if (!candidate || !FileSystem.existsSync(Path.join(candidate, '.tao', 'store', 'project.json'))) {
    return undefined
  }
  return Try.WithDefault(undefined, () => FileSystem.realpathSync(candidate))
}

async function materializeProject(cacheRoot: string, resources: Readonly<Record<string, string>>): Promise<string> {
  const entries = Object.entries(resources).sort(([left], [right]) => left.localeCompare(right))
  validateResources(entries)
  await FileSystem.mkdir(cacheRoot, { recursive: true })
  const fingerprint = Platform.hashText(JSON.stringify(entries))
  const root = Path.resolve(cacheRoot, `project-${fingerprint}`)
  const marker = Path.join(root, '.ready')
  if (await isReadyProject(root, marker, fingerprint, cacheRoot, entries)) {
    return root
  }
  const staging = `${root}.${Platform.randomUUID()}.pending`
  await FileSystem.mkdir(staging, { recursive: true })
  await Try(async () => {
    await writeResources(staging, entries)
    await FileSystem.writeFile(Path.join(staging, '.ready'), `${fingerprint}\n`)
    await replaceIncompleteRoot(root, cacheRoot)
    await FileSystem.rename(staging, root)
  }, { finally: () => FileSystem.rm(staging, { recursive: true, force: true }) })
  return root
}

function validateResources(entries: [string, string][]): void {
  if (
    entries.length === 0 || entries.some(([path]) => {
      return Path.isAbsolute(path)
        || path.split(Regxs.PathSeparatorRegx).some(part => !part || part === '.' || part === '..')
    })
  ) {
    Errors.ThrowUserInput('Embedded stdlib project contains an unsafe resource path.')
  }
}

async function isReadyProject(
  root: string,
  marker: string,
  fingerprint: string,
  cacheRoot: string,
  entries: [string, string][],
): Promise<boolean> {
  if (!await FileSystem.exists(root)) {
    return false
  }
  assertContainedPath(root, cacheRoot)
  if (!await FileSystem.exists(marker)) {
    return false
  }
  assertContainedPath(marker, root)
  if ((await FileSystem.readFile(marker, 'utf8')).trim() !== fingerprint) {
    return false
  }
  return await resourcesMatch(root, entries)
}

async function resourcesMatch(root: string, entries: [string, string][]): Promise<boolean> {
  for (const [relative, contents] of entries) {
    const path = Path.resolve(root, ...relative.split('/'))
    if (!await FileSystem.exists(path)) {
      return false
    }
    assertContainedPath(path, root)
    if (await FileSystem.readFile(path, 'utf8') !== contents) {
      return false
    }
  }
  return true
}

async function writeResources(staging: string, entries: [string, string][]): Promise<void> {
  for (const [relative, contents] of entries) {
    const target = Path.resolve(staging, ...relative.split('/'))
    const parent = Path.dirname(target)
    await FileSystem.mkdir(parent, { recursive: true })
    assertContainedPath(parent, staging)
    await FileSystem.writeFile(target, contents)
  }
}

async function replaceIncompleteRoot(root: string, cacheRoot: string): Promise<void> {
  if (!await FileSystem.exists(root)) {
    return
  }
  assertContainedPath(root, cacheRoot)
  await FileSystem.rm(root, { recursive: true, force: true })
}

function assertContainedPath(path: string, parent: string): void {
  const resolvedParent = Try.WithDefault(undefined, () => FileSystem.realpathSync(parent))
  const canonicalPath = Try.WithDefault(undefined, () => FileSystem.realpathSync(path))
  if (!resolvedParent || !canonicalPath || !Path.isWithin(resolvedParent, canonicalPath)) {
    Errors.ThrowUserInput(`Stdlib project cache path escapes its cache root: ${path}`)
  }
}
