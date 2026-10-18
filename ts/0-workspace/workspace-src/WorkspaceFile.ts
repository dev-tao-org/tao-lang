import { Errors, Time, Timings, Try } from '@shared'
import { FileSystem, WorkspaceWatch } from '@shared/os'
import type { PipelineStages, UpdateResult } from './Workspace'

/** readSource records source observation and disk reading before queued compilation. */
export async function readSource(path: string, observedAtMs = Time.timestampMs()): Promise<SourceSnapshot> {
  const timings = new Timings('workspace:input')
  timings.record('workspace.observe-to-read', Time.nowMs() - Math.max(0, Time.timestampMs() - observedAtMs))
  const source = await ReadWorkspaceSource(timings, path)
  return { source, observedAtMs, timings }
}

/** SourceSnapshot carries a disk snapshot and its input timings into the compiler queue. */
export type SourceSnapshot = { source: string; observedAtMs: number; timings: Timings }

/** WorkspaceFile owns source watching; saving waits for the watcher rather than invoking compilation.
 *  Opening waits for the newest in-flight refresh when its initial read is superseded. */
export class WorkspaceFile {
  private stopWatching: (() => void) | undefined
  private readonly waiters = new Set<SourceWaiter>()
  private refreshGeneration = 0
  private disposed = false
  private latestRefresh: Promise<UpdateResult> | undefined

  constructor(
    readonly path: string,
    private readonly compile: (snapshot: SourceSnapshot, isCurrent: () => boolean) => Promise<UpdateResult>,
    private readonly onResult?: (result: UpdateResult) => void,
    private readonly onError?: (error: unknown) => void,
    private readonly read: typeof readSource = readSource,
    private readonly watch: typeof WorkspaceWatch.watchFile = WorkspaceWatch.watchFile,
  ) {}

  async open(): Promise<UpdateResult> {
    const onError = this.onError
    this.stopWatching = this.watch(this.path, observedAtMs => {
      void Try(() => this.startRefresh(observedAtMs), {
        catch(error) {
          onError?.(error)
        },
      })
    })
    let pending = this.startRefresh(Time.timestampMs())
    while (true) {
      const result = await pending
      if (this.disposed || pending === this.latestRefresh) {
        return result
      }
      pending = this.latestRefresh!
    }
  }

  private startRefresh(observedAtMs: number): Promise<UpdateResult> {
    this.latestRefresh = this.refresh(observedAtMs)
    return this.latestRefresh
  }

  async save(source: string | ((current: string) => string)): Promise<UpdateResult> {
    const nextSource = typeof source === 'function' ? source(await FileSystem.readFile(this.path, 'utf8')) : source
    const waiters = this.waiters
    let waiter!: SourceWaiter
    const result = new Promise<UpdateResult>((resolve, reject) => {
      waiter = { source: nextSource, resolve, reject }
      this.waiters.add(waiter)
    })
    const cancel = Time.schedule(
      5000,
      () => waiter.reject(sourceFailure('Saved source was not observed: ' + this.path)),
    )
    return await Try(async () => {
      const [, update] = await Promise.all([FileSystem.writeFile(this.path, nextSource, 'utf8'), result])
      return update
    }, {
      finally() {
        cancel()
        waiters.delete(waiter)
      },
    })
  }

  dispose(): void {
    this.disposed = true
    this.refreshGeneration++
    this.stopWatching?.()
    for (const waiter of this.waiters) {
      waiter.reject(sourceFailure('Workspace source was closed: ' + this.path))
    }
    this.waiters.clear()
  }

  private async refresh(observedAtMs: number): Promise<UpdateResult> {
    const generation = ++this.refreshGeneration
    const isCurrent = () => !this.disposed && generation === this.refreshGeneration
    const snapshot = await this.read(this.path, observedAtMs)
    if (!isCurrent()) {
      const result = supersededResult(generation)
      this.settleWaiters(snapshot.source, result)
      return result
    }
    const result = await this.compile(snapshot, isCurrent)
    if (!isCurrent()) {
      const superseded = supersededResult(generation)
      this.settleWaiters(snapshot.source, superseded)
      return superseded
    }
    this.onResult?.(result)
    this.settleWaiters(snapshot.source, result)
    return result
  }

  private settleWaiters(source: string, result: UpdateResult): void {
    for (const waiter of this.waiters) {
      if (waiter.source === source) {
        waiter.resolve(result)
      }
    }
  }
}

const ReadWorkspaceSource = Timings.measure('workspace.read', readWorkspaceSource)

function readWorkspaceSource(path: string): Promise<string> {
  return FileSystem.readFile(path, 'utf8')
}

type SourceWaiter = { source: string; resolve(result: UpdateResult): void; reject(error: unknown): void }

function sourceFailure(message: string): Errors.TaoError {
  return Try(() => Errors.ThrowHostEnvironment(message), {
    catch: (error) => Errors.fromUnknown(error),
  })
}

function supersededResult(generation: number): UpdateResult {
  return {
    status: 'superseded',
    revision: `source-${generation}`,
    timings: [],
    stages: emptyStages(),
  }
}

function emptyStages(): PipelineStages {
  return {
    typecheck: { stage: 'typecheck', status: 'skipped' },
    fix: { stage: 'fix', status: 'skipped' },
    check: { stage: 'check', status: 'skipped' },
  }
}
