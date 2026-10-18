import { Errors, Time } from '@shared'
import type { WorkspaceWatch } from '@shared/os'
import type { FileManagerOptions } from '../workspace-src/FileManager'

/** createWatchFixture supplies notifications and debounce turns without native observation. */
export function createWatchFixture() {
  let changed: ((change: WorkspaceWatch.WorkspaceChange) => void) | undefined
  let scheduled: (() => void) | undefined
  const options = {
    async watch(_root, onChange) {
      changed = onChange
      return { async dispose() {} }
    },
    schedule(_delay, callback) {
      scheduled = callback
      return () => {
        scheduled = undefined
      }
    },
  } satisfies Pick<FileManagerOptions, 'watch' | 'schedule'>
  return {
    options,
    notify(path: string): void {
      const notify = changed ?? Errors.ThrowUnexpected('Open the workspace before notifying it.')
      notify({ kind: 'change', path, observedAtMs: Time.timestampMs() })
      const callback = scheduled
      scheduled = undefined
      callback?.()
    },
  }
}
