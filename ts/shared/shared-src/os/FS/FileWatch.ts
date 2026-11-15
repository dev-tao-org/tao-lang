import { Errors, Lists, Sort, Time, Try } from '@shared'
import { Path } from '@shared/os'
import type { FSWatcher } from '../bridges/Bridge_chokidar'
import type { Stats } from '../bridges/Bridge_node/Bridge_node'
import { reconcileWatchChanges, watchStamp } from './FileWatchChanges'

/** FileChange identifies one file or directory notification. */
export type FileChange = {
  path: string
  kind: ChangeKind
  observedAtMs: number
  reconciled?: true
}

/** Watcher updates dynamic observation roots and releases native subscriptions. */
export type Watcher = {
  updateDirectories?(additionalDirectories: readonly string[], ignoredDirectories: readonly string[]): Promise<void>
  dispose(): Promise<void>
}

/** WatchTreeOptions selects extra roots and paths to exclude from observation. */
export type WatchTreeOptions = {
  additionalDirectories?: readonly string[]
  ignoredDirectories?: readonly string[]
  ignorePath?: (relativePath: string) => boolean
}

type WatchChangeReconciliation = {
  observe(path: string, stamp: string): void
  dispose(): void
}

/** watchTree observes file and directory changes without following links.
 *  Resolves after initial discovery. */
export async function watchTree(
  directory: string,
  onChange: (change: FileChange) => void,
  onError: (error: unknown) => void,
  options: WatchTreeOptions = {},
): Promise<Watcher> {
  const root = Path.resolve(directory)
  const excluded = collectUniquePaths(options.ignoredDirectories ?? [])
  const roots = [root, ...collectUniquePaths(options.additionalDirectories ?? []).filter(path => path !== root)]
  const watcher = await createWatcher(roots, excluded, options.ignorePath)
  let ready = false
  let disposed = false
  const reconciliation = reconcileWatchChanges(path => {
    if (!disposed) {
      onChange({ kind: 'change', path, observedAtMs: Time.timestampMs(), reconciled: true })
    }
  })
  watcher.on('all', (kind, path, stats) => {
    if (!ready || disposed) {
      return
    }
    if (isChangeKind(kind)) {
      onChange({ kind, path: Path.resolve(path), observedAtMs: Time.timestampMs() })
      if (kind === 'change' && stats) {
        reconciliation.observe(Path.resolve(path), watchStamp(stats))
      }
    }
  })
  await Try(() =>
    new Promise<void>((resolve, reject) => {
      watcher.once('ready', () => {
        ready = true
        resolve()
      })
      watcher.on('error', error => ready ? onError(error) : reject(error))
    }), {
    async catch(error) {
      reconciliation.dispose()
      await watcher.close()
      Errors.Throw(error)
    },
  })
  return dynamicWatcher(watcher, root, roots, excluded, reconciliation, () => disposed, () => disposed = true)
}

type ChangeKind = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

function dynamicWatcher(
  watcher: FSWatcher,
  root: string,
  roots: string[],
  excluded: string[],
  reconciliation: WatchChangeReconciliation,
  isDisposed: () => boolean,
  dispose: () => void,
): Watcher {
  let updates = Promise.resolve()
  return {
    updateDirectories(additional, ignored) {
      const update = updates.then(async () => {
        if (isDisposed()) {
          return
        }
        const nextRoots = [root, ...collectUniquePaths(additional).filter(path => path !== root)]
        const removed = roots.filter(path => path !== root && !nextRoots.includes(path))
        const added = nextRoots.filter(path => !roots.includes(path))
        roots.splice(0, roots.length, ...nextRoots)
        excluded.splice(0, excluded.length, ...collectUniquePaths(ignored))
        if (removed.length > 0) {
          await watcher.unwatch(removed)
        }
        if (!isDisposed() && added.length > 0) {
          watcher.add(added)
        }
      })
      updates = update.catch(() => {})
      return update
    },
    async dispose() {
      dispose()
      reconciliation.dispose()
      await updates
      await watcher.close()
    },
  }
}

async function createWatcher(roots: string[], excluded: string[], ignorePath: WatchTreeOptions['ignorePath']) {
  const { watch } = await import('../bridges/Bridge_chokidar')
  return watch(roots, {
    ignoreInitial: true,
    followSymlinks: false,
    usePolling: false,
    awaitWriteFinish: false,
    atomic: 5,
    ignored: (path, stats) => ignoredRootsPath(roots, path, excluded, ignorePath, stats),
  })
}

function ignoredRootsPath(
  roots: readonly string[],
  path: string,
  excluded: readonly string[],
  ignorePath: WatchTreeOptions['ignorePath'],
  stats?: Stats,
): boolean {
  const root = roots.find(root => withinDirectory(root, path))
  return root === undefined || ignoredPath(root, path, excluded, ignorePath, stats)
}

function ignoredPath(
  root: string,
  path: string,
  excluded: readonly string[],
  ignorePath: WatchTreeOptions['ignorePath'],
  stats?: Stats,
): boolean {
  const relative = Path.relative(root, path)
  if (!relative) {
    return false
  }
  return ignorePath?.(relative) === true || stats?.isSymbolicLink() === true
    || excluded.some(root => withinDirectory(root, path))
}

function withinDirectory(root: string, path: string): boolean {
  return Path.isWithin(root, path)
}

function collectUniquePaths(paths: readonly string[]): string[] {
  return Lists.unique(paths.map(path => Path.resolve(path))).sort(Sort.CompareStrings)
}

function isChangeKind(kind: string): kind is FileChange['kind'] {
  return ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(kind)
}
