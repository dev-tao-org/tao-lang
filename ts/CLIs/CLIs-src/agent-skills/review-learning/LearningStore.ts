import { Json, NewlineCharacter, Regxs, Sort, Try, UserInput } from '@shared'
import { FileLock, FS, Path, Platform } from '@shared/os'
import type { Correction, LearningFileHashes, LearningSnapshot, LearningState } from './LearningTypes'

/** encodeLearningSnapshot retains insertion order in the complete scan identity. */
export function encodeLearningSnapshot(snapshot: LearningSnapshot): string {
  return Json.Print(snapshot, { prettyPrint: false })
}

/** haveDifferentLearningFileHashes compares captured hashes while retaining path insertion order. */
export function haveDifferentLearningFileHashes(left: LearningFileHashes, right: LearningFileHashes): boolean {
  return Json.Print(left, { prettyPrint: false }) !== Json.Print(right, { prettyPrint: false })
}

/** withLearningState serializes retained state writes within the authorized checkout. */
export async function withLearningState<Value>(
  root: string,
  action: (state: LearningState) => Promise<Value>,
): Promise<Value> {
  const directory = Path.join(root, '.artifacts/notes/review-learning')
  await ensureProjectMetadataDirectory(root, directory)
  const lock = await FileLock.tryAcquire(Path.join(directory, 'operation.lock'))
  UserInput.require(!!lock, 'Another review learning operation is active.')
  return await Try(async () => {
    const path = Path.join(directory, 'state.json')
    const state: LearningState = await FS.exists(path)
      ? await readLearningState(path)
      : { version: 1, root, corrections: [], scans: [], proposals: [], protectedFiles: [], events: [] }
    UserInput.require(
      !(state.version !== 1 || state.root !== root),
      'Review learning state belongs to another checkout or version.',
    )
    const result = await action(state)
    await saveLearningState(state)
    return result
  }, { finally: () => lock.release() })
}

/** saveLearningState atomically publishes metadata before or after a source write. */
export async function saveLearningState(state: LearningState): Promise<void> {
  const path = Path.join(state.root, '.artifacts/notes/review-learning/state.json')
  const temporary = `${path}.${Platform.randomUUID()}.pending`
  await FS.writeFile(temporary, Json.Print(state) + NewlineCharacter, { flag: 'wx' })
  await FS.rename(temporary, path)
}

/** safeSourcePath confines source operations to real project files without links or generated content. */
export function safeSourcePath(root: string, input: string, allowRoot = false): string {
  const absolute = Path.resolve(root, input)
  const relative = Path.relative(root, absolute).replaceAll('\\', '/')
  if (isUnsafeSourcePath(relative, allowRoot)) {
    UserInput.fail(`Unsafe source path: ${input}`)
  }
  let current = root
  for (const segment of relative.split('/').filter(Boolean)) {
    current = Path.join(current, segment)
    if (FS.existsSync(current) && FS.lstatSync(current).isSymbolicLink()) {
      UserInput.fail(`Symbolic links are outside review learning scope: ${input}`)
    }
  }
  return relative
}

/** snapshotScope hashes all scoped sources and workspace configuration, including newly added files. */
export async function snapshotScope(
  root: string,
  correction: Correction,
): Promise<LearningSnapshot> {
  const candidates = await collectSources(root)
  const files: LearningFileHashes = {}
  const inputs: LearningFileHashes = {}
  for (const file of candidates) {
    inputs[file] = await hashFile(root, file)
    if (isInScope(file, correction.scope) && !isInScope(file, correction.excludedPaths ?? [])) {
      files[file] = inputs[file]!
    }
  }
  const configs: LearningFileHashes = {}
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
  return scopes.some(scope => isRootScope(scope) || file === scope || file.startsWith(scope + '/'))
}

/** ensureProjectMetadataDirectory refuses links before creating owned metadata directories. */
export async function ensureProjectMetadataDirectory(root: string, directory: string): Promise<void> {
  const relative = Path.relative(root, directory)
  let current = root
  for (const segment of relative.replaceAll('\\', '/').split('/')) {
    current = Path.join(current, segment)
    UserInput.require(
      !(FS.existsSync(current) && FS.lstatSync(current).isSymbolicLink()),
      'Review learning metadata directories must not be symbolic links.',
    )
    await FS.mkdir(current)
  }
}

async function hashFile(root: string, file: string): Promise<string> {
  safeSourcePath(root, file)
  return Platform.hashText(await FS.readFile(Path.join(root, file), 'utf8'))
}

function isUnsafeSourcePath(relative: string, allowRoot: boolean): boolean {
  const isUnapprovedRoot = !relative && !allowRoot
  const escapesRepository = relative === '..' || relative.startsWith('../')
  const isOutsideRepository = escapesRepository || Path.isAbsolute(relative)
  return isUnapprovedRoot || isOutsideRepository || isExcluded(relative)
}

function isRootScope(scope: string): boolean {
  return scope === '.' || scope === ''
}

async function readLearningState(path: string): Promise<LearningState> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as LearningState
}

async function collectSources(root: string): Promise<string[]> {
  const result: string[] = []
  await walkFiles(root, '', result, file => Regxs.TypeScriptSourceFileRegx.test(file))
  return result.sort(Sort.CompareStrings)
}

async function collectConfigs(root: string): Promise<string[]> {
  const result: string[] = []
  await walkFiles(root, '', result, file => Regxs.ReviewConfigurationFileNameRegx.test(file))
  return result.sort(Sort.CompareStrings)
}

async function walkFiles(
  root: string,
  directory: string,
  output: string[],
  matches: (file: string) => boolean,
): Promise<void> {
  for (const entry of await FS.readdir(Path.join(root, directory), { withFileTypes: true })) {
    const file = directory ? `${directory}/${entry.name}` : entry.name
    if (isExcluded(file) || entry.isSymbolicLink()) {
      continue
    }
    if (entry.isDirectory()) {
      await walkFiles(root, file, output, matches)
    } else if (entry.isFile() && matches(file)) {
      const text = await FS.readFile(Path.join(root, file), 'utf8')
      if (!Regxs.ReviewGeneratedMarkerRegx.test(text.slice(0, 1000))) {
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
