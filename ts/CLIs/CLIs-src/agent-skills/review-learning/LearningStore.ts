import { Errors, Try } from '@shared'
import { FileSystem, Path, Platform, SessionLock } from '@shared/os'
import type { Correction, LearningState, Scan } from './LearningTypes'

/** withLearningState serializes retained state writes within the authorized checkout. */
export async function withLearningState<Value>(
  root: string,
  action: (state: LearningState) => Promise<Value>,
): Promise<Value> {
  const directory = Path.join(root, '.artifacts/notes/review-learning')
  await ensureProjectMetadataDirectory(root, directory)
  const lock = await SessionLock.acquire(Path.join(directory, 'operation.lock'))
  if (!lock) {
    Errors.ThrowUserInput('Another review learning operation is active.')
  }
  return await Try(async () => {
    const path = Path.join(directory, 'state.json')
    const state: LearningState = await FileSystem.exists(path)
      ? JSON.parse(await FileSystem.readFile(path, 'utf8'))
      : { version: 1, root, corrections: [], scans: [], proposals: [], protectedFiles: [], events: [] }
    if (state.version !== 1 || state.root !== root) {
      Errors.ThrowUserInput('Review learning state belongs to another checkout or version.')
    }
    const result = await action(state)
    await saveLearningState(state)
    return result
  }, { finally: () => lock.release() })
}

/** saveLearningState atomically publishes metadata before or after a source write. */
export async function saveLearningState(state: LearningState): Promise<void> {
  const path = Path.join(state.root, '.artifacts/notes/review-learning/state.json')
  const temporary = `${path}.${Platform.randomUUID()}.pending`
  await FileSystem.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
  await FileSystem.rename(temporary, path)
}

/** safeSourcePath confines source operations to real project files without links or generated content. */
export function safeSourcePath(root: string, input: string, allowRoot = false): string {
  const absolute = Path.resolve(root, input)
  const relative = Path.relative(root, absolute).replaceAll('\\', '/')
  if (isUnsafeSourcePath(relative, allowRoot)) {
    Errors.ThrowUserInput(`Unsafe source path: ${input}`)
  }
  let current = root
  for (const segment of relative.split('/').filter(Boolean)) {
    current = Path.join(current, segment)
    if (FileSystem.existsSync(current) && FileSystem.lstatSync(current).isSymbolicLink()) {
      Errors.ThrowUserInput(`Symbolic links are outside review learning scope: ${input}`)
    }
  }
  return relative
}

/** snapshotScope hashes all scoped sources and workspace configuration, including newly added files. */
export async function snapshotScope(
  root: string,
  correction: Correction,
): Promise<Pick<Scan, 'files' | 'inputs' | 'configs'>> {
  const candidates = await collectSources(root)
  const files: Record<string, string> = {}
  const inputs: Record<string, string> = {}
  for (const file of candidates) {
    inputs[file] = await hashFile(root, file)
    if (isInScope(file, correction.scope) && !isInScope(file, correction.excludedPaths ?? [])) {
      files[file] = inputs[file]!
    }
  }
  const configs: Record<string, string> = {}
  for (const file of await collectConfigs(root)) {
    configs[file] = await hashFile(root, file)
  }
  if (correction.authoritySource) {
    configs[correction.authoritySource.file] = await hashFile(root, correction.authoritySource.file)
  }
  return { files, inputs, configs }
}

/** isInScope matches literal files or descendant paths rather than shell patterns. */
export function isInScope(file: string, scopes: string[]): boolean {
  return scopes.some(scope => scope === '.' || scope === '' || file === scope || file.startsWith(scope + '/'))
}

/** ensureProjectMetadataDirectory refuses links before creating owned metadata directories. */
export async function ensureProjectMetadataDirectory(root: string, directory: string): Promise<void> {
  const relative = Path.relative(root, directory)
  let current = root
  for (const segment of relative.replaceAll('\\', '/').split('/')) {
    current = Path.join(current, segment)
    if (FileSystem.existsSync(current) && FileSystem.lstatSync(current).isSymbolicLink()) {
      Errors.ThrowUserInput('Review learning metadata directories must not be symbolic links.')
    }
    await FileSystem.mkdir(current, { recursive: true })
  }
}

async function hashFile(root: string, file: string): Promise<string> {
  safeSourcePath(root, file)
  return Platform.hashText(await FileSystem.readFile(Path.join(root, file), 'utf8'))
}

function isUnsafeSourcePath(relative: string, allowRoot: boolean): boolean {
  return (!relative && !allowRoot) || relative === '..' || relative.startsWith('../') || Path.isAbsolute(relative)
    || isExcluded(relative)
}

async function collectSources(root: string): Promise<string[]> {
  const result: string[] = []
  await walkFiles(root, '', result, file => /\.[cm]?tsx?$/.test(file))
  return result.sort()
}

async function collectConfigs(root: string): Promise<string[]> {
  const result: string[] = []
  await walkFiles(root, '', result, file => /(^|\/)(tsconfig[^/]*\.json|package\.json|bun\.lock)$/.test(file))
  return result.sort()
}

async function walkFiles(
  root: string,
  directory: string,
  output: string[],
  matches: (file: string) => boolean,
): Promise<void> {
  for (const entry of await FileSystem.readdir(Path.join(root, directory), { withFileTypes: true })) {
    const file = directory ? `${directory}/${entry.name}` : entry.name
    if (isExcluded(file) || entry.isSymbolicLink()) {
      continue
    }
    if (entry.isDirectory()) {
      await walkFiles(root, file, output, matches)
    } else if (entry.isFile() && matches(file)) {
      const text = await FileSystem.readFile(Path.join(root, file), 'utf8')
      if (!/@third-party|@generated|DO NOT EDIT/.test(text.slice(0, 1000))) {
        output.push(file)
      }
    } else {
      // Non-source project assets are outside these TypeScript queries.
    }
  }
}

function isExcluded(file: string): boolean {
  return file.split('/').some(part =>
    ['.git', '.artifacts', '.x-tao-old-v1', '.devenv', 'node_modules', 'vendor', 'dist', 'build', '.storage'].includes(
      part,
    )
    || part.startsWith('_gen_')
  )
}
