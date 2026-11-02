import { Errors, Lists, Regxs, Time, Try } from '@shared'
import { Path } from '@shared/os'
import type { FSWatcher } from './bridges/Bridge_chokidar'
import type { Stats } from './bridges/Bridge_node/Bridge_node'
import { reconcileWatchChanges, watchStamp } from './WorkspaceWatchChanges'

/** WorkspaceChange identifies one authored file or directory notification. */
export type WorkspaceChange = {
  path: string
  kind: WorkspaceChangeKind
  observedAtMs: number
}

/** WorkspaceWatcher updates dynamic observation roots and releases native subscriptions. */
export type WorkspaceWatcher = {
  updateDirectories?(additionalDirectories: readonly string[], ignoredDirectories: readonly string[]): Promise<void>
  dispose(): Promise<void>
}

/** WorkspaceWatchSession is the Chokidar handle that observes a workspace tree. */
export type WorkspaceWatchSession = FSWatcher

type WatchChangeReconciliation = {
  observe(path: string, stamp: string): void
  dispose(): void
}

/** watchWorkspace observes a source tree without following links or debouncing compilation.
 *  Resolves after initial discovery; generated, hidden and installed trees are excluded. */
export async function watchWorkspace(
  directory: string,
  onChange: (change: WorkspaceChange) => void,
  onError: (error: unknown) => void,
  ignoredDirectories: readonly string[] = [],
  additionalDirectories: readonly string[] = [],
): Promise<WorkspaceWatcher> {
  const root = Path.resolve(directory)
  const excluded = collectUniquePaths(ignoredDirectories)
  const roots = [root, ...collectUniquePaths(additionalDirectories).filter(path => path !== root)]
  const watcher = await createWatcher(roots, excluded)
  let ready = false
  let disposed = false
  const reconciliation = reconcileWatchChanges(path => {
    if (!disposed) {
      onChange({ kind: 'change', path, observedAtMs: Time.timestampMs() })
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

type WorkspaceChangeKind = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

function dynamicWatcher(
  watcher: WorkspaceWatchSession,
  root: string,
  roots: string[],
  excluded: string[],
  reconciliation: WatchChangeReconciliation,
  isDisposed: () => boolean,
  dispose: () => void,
): WorkspaceWatcher {
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

async function createWatcher(roots: string[], excluded: string[]) {
  const { watch } = await import('./bridges/Bridge_chokidar')
  return watch(roots, {
    ignoreInitial: true,
    followSymlinks: false,
    usePolling: false,
    awaitWriteFinish: false,
    atomic: 5,
    ignored: (path, stats) => ignoredRootsPath(roots, path, excluded, stats),
  })
}

function ignoredRootsPath(roots: readonly string[], path: string, excluded: readonly string[], stats?: Stats): boolean {
  const root = roots.find(root => withinDirectory(root, path))
  return root === undefined || ignoredPath(root, path, excluded, stats)
}

function ignoredPath(root: string, path: string, excluded: readonly string[], stats?: Stats): boolean {
  const relative = Path.relative(root, path)
  if (!relative) {
    return false
  }
  const parts = relative.split(Regxs.PathSeparatorRegx)
  return parts.some(ignoredName) || stats?.isSymbolicLink() === true
    || excluded.some(root => withinDirectory(root, path))
}

function withinDirectory(root: string, path: string): boolean {
  return Path.isWithin(root, path)
}

function collectUniquePaths(paths: readonly string[]): string[] {
  return Lists.unique(paths.map(path => Path.resolve(path))).sort()
}

function ignoredName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_gen_') || name === 'node_modules'
}

function isChangeKind(kind: string): kind is WorkspaceChange['kind'] {
  return ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(kind)
}
