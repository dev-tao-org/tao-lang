import { Path } from '@shared/os'
import { watch as watchDirectory } from 'node:fs'

/** watchFile observes replacements and writes to one authored file without locking its editor. */
export function watchFile(path: string, onChange: () => void, debounceMs = 5): () => void {
  let generation = 0
  let disposed = false
  const watcher = watchDirectory(Path.dirname(path), (_event, filename) => {
    if (!filename || filename.toString() === Path.basename(path)) {
      scheduleChange()
    }
  })
  return () => {
    disposed = true
    generation++
    watcher.close()
  }

  function scheduleChange(): void {
    const current = ++generation
    setTimeout(() => {
      if (!disposed && current === generation) {
        onChange()
      }
    }, debounceMs)
  }
}
