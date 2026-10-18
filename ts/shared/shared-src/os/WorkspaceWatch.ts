import { Errors, Time, Try } from '@shared'
import { Path } from '@shared/os'
import type { Stats } from 'node:fs'

/** WorkspaceChange identifies one authored file or directory notification. */
export type WorkspaceChange = {
  path: string
  kind: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  observedAtMs: number
}

/** WorkspaceWatcher releases one workspace tree's native subscriptions. */
export type WorkspaceWatcher = { dispose(): Promise<void> }

/** watchWorkspace observes a source tree without following links or debouncing compilation.
 *  Resolves after initial discovery; generated, hidden and installed trees are excluded. */
export async function watchWorkspace(
  directory: string,
  onChange: (change: WorkspaceChange) => void,
  onError: (error: unknown) => void,
  ignoredDirectories: readonly string[] = [],
): Promise<WorkspaceWatcher> {
  const { watch } = await import('chokidar')
  const root = Path.resolve(directory)
  const excluded = ignoredDirectories.map(path => Path.resolve(path))
  const watcher = watch(root, {
    ignoreInitial: true,
    followSymlinks: false,
    usePolling: false,
    awaitWriteFinish: false,
    atomic: 5,
    ignored: (path, stats) => ignoredPath(root, path, excluded, stats),
  })
  let ready = false
  let disposed = false
  watcher.on('all', (kind, path) => {
    if (!ready || disposed) {
      return
    }
    if (isChangeKind(kind)) {
      onChange({ kind, path: Path.resolve(path), observedAtMs: Time.timestampMs() })
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
      await watcher.close()
      Errors.Throw(error)
    },
  })
  return {
    async dispose() {
      disposed = true
      await watcher.close()
    },
  }
}

function ignoredPath(root: string, path: string, excluded: readonly string[], stats?: Stats): boolean {
  const relative = Path.relative(root, path)
  if (!relative) {
    return false
  }
  const parts = relative.split(/[\\/]/)
  return parts.some(ignoredName) || stats?.isSymbolicLink() === true
    || excluded.some(root => withinDirectory(root, path))
}

function withinDirectory(root: string, path: string): boolean {
  const relative = Path.relative(root, path)
  return relative === '' || (!Path.isAbsolute(relative) && relative.split(/[\\/]/)[0] !== '..')
}

function ignoredName(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_gen_') || name === 'node_modules'
}

function isChangeKind(kind: string): kind is WorkspaceChange['kind'] {
  return ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(kind)
}
