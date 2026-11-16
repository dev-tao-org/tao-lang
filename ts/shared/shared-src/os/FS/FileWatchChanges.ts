import { Time, Try } from '../../universal/universal'
import { stat } from '../bridges/Bridge_node/Bridge_node'

type WatchStats = { mtimeMs: number; ctimeMs: number; size: number; ino: number }
/** watchStamp identifies a filesystem observation without reading source contents. */
export function watchStamp(stats: WatchStats): string {
  return `${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}:${stats.ino}`
}

/** reconcileWatchChanges observes the trailing edge of Chokidar's 50ms change suppression.
 *  First notifications remain immediate; unchanged files do not trigger another compilation. */
export function reconcileWatchChanges(changed: (path: string) => void) {
  const pending = new Map<string, { cancel(): void }>()
  let disposed = false
  return {
    observe(path: string, stamp: string): void {
      pending.get(path)?.cancel()
      const observation = { cancel() {} }
      observation.cancel = Time.schedule(55, () => {
        void readStamp(path).then(current => {
          if (pending.get(path) !== observation) {
            return
          }
          pending.delete(path)
          if (!disposed && current !== undefined && current !== stamp) {
            changed(path)
          }
        })
      })
      pending.set(path, observation)
    },
    dispose(): void {
      disposed = true
      for (const observation of pending.values()) {
        observation.cancel()
      }
      pending.clear()
    },
  }
}

async function readStamp(path: string): Promise<string | undefined> {
  return await Try.WithDefault(undefined, async () => watchStamp(await stat(path)))
}
