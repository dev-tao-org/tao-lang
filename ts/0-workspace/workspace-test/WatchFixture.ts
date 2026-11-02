import { Errors, Time, Try } from '@shared'
import { WorkspaceWatch } from '@shared/os'
import { FileManager, type FileManagerOptions } from '../workspace-src/file-manager/FileManager'
import type { UpdateResult } from '../workspace-src/Workspace'

/** createWatchFixture supplies notifications and debounce turns without native observation. */
export function createWatchFixture(): WatchFixture {
  let changed: OptionalWatchChangeHandler
  let scheduled: OptionalScheduledCallback
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
  } satisfies Pick<FileManagerOptions, WatchFixtureOption>
  return {
    options,
    notify(path: string): void {
      const notify = changed ?? Errors.ThrowShouldNeverHappen('Open the workspace before notifying it.')
      notify({ kind: 'change', path, observedAtMs: Time.timestampMs() })
      const callback = scheduled
      scheduled = undefined
      callback?.()
    },
  }
}

/** createManagerFixture builds a recording FileManager with controllable reads and watch events. */
export function createManagerFixture(
  read: (path: string, observedAtMs: number, index: number) => Promise<ReadSnapshot>,
  compileSource: (source: string, isCurrent: () => boolean) => Promise<UpdateResult> = async (_source, isCurrent) =>
    createUpdateResult(isCurrent() ? 'published' : 'superseded'),
  options: Partial<FileManagerOptions> = {},
) {
  const state = createManagerFixtureState()
  const manager = createFixtureManager(read, compileSource, state, options)
  manager.onCompiled(event => {
    state.completed.set(event.source, event.result)
    state.waiters.get(event.source)?.(event.result)
  })
  return {
    manager,
    compiled: state.compiled,
    get closed() {
      return state.closed
    },
    get readCount() {
      return state.readCount
    },
    get maxConcurrentReads() {
      return state.maxConcurrentReads
    },
    notify(kind: WorkspaceWatch.WorkspaceChange['kind'], path: string) {
      state.onChange?.({ kind, path, observedAtMs: Time.timestampMs() })
    },
    flush() {
      const callback = state.scheduled
      state.scheduled = undefined
      callback?.()
    },
    async waitForCompiled(source: string) {
      const existing = state.completed.get(source)
      return existing ?? await new Promise(resolve => state.waiters.set(source, resolve))
    },
    async dispose() {
      await manager.dispose()
    },
  }
}

/** createDynamicWatchFixture records directory updates and controls watcher notifications. */
export function createDynamicWatchFixture() {
  let changed: OptionalWatchChangeHandler
  let scheduled: OptionalScheduledCallback
  let watches = 0
  let reads = 0
  const updates: Array<{ directories: readonly string[]; ignored: readonly string[] }> = []
  const manager = new FileManager({
    directory: '/workspace',
    outputDirectory: '/workspace/output',
    watchDirectories: ['/workspace/static'],
    async watch(_root, onChange) {
      watches++
      changed = onChange
      return {
        async updateDirectories(directories, ignored) {
          updates.push({ directories, ignored })
        },
        async dispose() {},
      }
    },
    read: async (_path, observedAtMs) => ({ source: `read-${++reads}`, observedAtMs }),
    schedule(_delay, callback) {
      scheduled = callback
      return () => scheduled = undefined
    },
    compile: async (_request, isCurrent) => createUpdateResult(isCurrent() ? 'published' : 'superseded'),
  })
  return {
    manager,
    watchCalls: () => watches,
    updates: () => updates,
    scheduled: () => scheduled,
    change: (change: WorkspaceWatch.WorkspaceChange) => changed?.(change),
    flush() {
      const callback = scheduled
      scheduled = undefined
      callback?.()
    },
  }
}

/** waitForCompiledSource resolves after the requested source has completed compilation. */
export function waitForCompiledSource(manager: FileManager, source: string): Promise<UpdateResult> {
  return new Promise(resolve => {
    const unsubscribe = manager.onCompiled(event => {
      if (event.source === source) {
        unsubscribe()
        resolve(event.result)
      }
    })
  })
}

/** createReadSnapshot pairs fixture source with its observed timestamp. */
export function createReadSnapshot(source: string): ReadSnapshot {
  return { source, observedAtMs: Time.timestampMs() }
}

/** createUpdateResult builds a minimal successful or superseded pipeline result. */
export function createUpdateResult(status: Exclude<UpdateResult['status'], 'failed'>): UpdateResult {
  return {
    status,
    revision: 'fixture',
    timings: [],
    stages: {
      typecheck: { stage: 'typecheck', status: 'skipped' },
      fix: { stage: 'fix', status: 'skipped' },
      check: { stage: 'check', status: 'skipped' },
    },
  }
}

/** createDeferredVoid exposes a promise gate for deterministic watcher and read races. */
export function createDeferredVoid() {
  let resolve!: () => void
  const promise = new Promise<void>(complete => resolve = complete)
  return { promise, resolve }
}

type WatchChangeHandler = (change: WorkspaceWatch.WorkspaceChange) => void
type OptionalWatchChangeHandler = WatchChangeHandler | undefined
type ScheduledCallback = () => void
type OptionalScheduledCallback = ScheduledCallback | undefined
type WatchFixtureOption = 'watch' | 'schedule'
/** WatchFixture supplies an observable manager configuration with direct event notifications. */
export type WatchFixture = { options: Pick<FileManagerOptions, WatchFixtureOption>; notify(path: string): void }

type ReadSnapshot = { source: string; observedAtMs: number }

type ManagerFixtureState = {
  onChange: OptionalWatchChangeHandler
  scheduled: OptionalScheduledCallback
  readCount: number
  activeReads: number
  maxConcurrentReads: number
  closed: number
  compiled: string[]
  completed: Map<string, UpdateResult>
  waiters: Map<string, (result: UpdateResult) => void>
}

function createManagerFixtureState(): ManagerFixtureState {
  return {
    onChange: undefined,
    scheduled: undefined,
    readCount: 0,
    activeReads: 0,
    maxConcurrentReads: 0,
    closed: 0,
    compiled: [],
    completed: new Map(),
    waiters: new Map(),
  }
}

function createFixtureManager(
  read: (path: string, observedAtMs: number, index: number) => Promise<ReadSnapshot>,
  compileSource: (source: string, isCurrent: () => boolean) => Promise<UpdateResult>,
  state: ManagerFixtureState,
  options: Partial<FileManagerOptions>,
): FileManager {
  return new FileManager({
    ...options,
    async read(path, observedAtMs) {
      state.activeReads++
      state.maxConcurrentReads = Math.max(state.maxConcurrentReads, state.activeReads)
      return await Try(() => read(path, observedAtMs, state.readCount++), {
        finally() {
          state.activeReads--
        },
      })
    },
    async watch(_directory, change) {
      state.onChange = change
      return {
        async dispose() {
          state.closed++
        },
      }
    },
    schedule(_delayMs, callback) {
      state.scheduled = callback
      return () => state.scheduled = undefined
    },
    async compile(request, isCurrent) {
      state.compiled.push(request.source)
      return await compileSource(request.source, isCurrent)
    },
  })
}
