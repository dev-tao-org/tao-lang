import { Errors, Time, Timings, Try } from '@shared'
import { FileSystem } from '@shared/os'
import * as WorkspaceWatch from '../../shared/shared-src/os/WorkspaceWatch'
import type { UpdateResult } from './Workspace'

/** readSource records source observation and disk reading before queued compilation. */
export async function readSource(path: string, observedAtMs = Time.timestampMs()): Promise<SourceSnapshot> {
  const timings = new Timings('workspace:input')
  timings.record('workspace.observe-to-read', Time.nowMs() - Math.max(0, Time.timestampMs() - observedAtMs))
  const source = await timings.measure('workspace.read', () => FileSystem.readFile(path, 'utf8'))
  return { source, observedAtMs, timings }
}

/** SourceSnapshot carries a disk snapshot and its input timings into the compiler queue. */
export type SourceSnapshot = { source: string; observedAtMs: number; timings: Timings }

/** WorkspaceFile owns source watching; saving waits for the watcher rather than invoking compilation. */
export class WorkspaceFile {
  private stopWatching: (() => void) | undefined
  private readonly waiters = new Set<SourceWaiter>()

  constructor(
    readonly path: string,
    private readonly compile: (snapshot: SourceSnapshot) => Promise<UpdateResult>,
    private readonly onResult?: (result: UpdateResult) => void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  async open(): Promise<UpdateResult> {
    const onError = this.onError
    this.stopWatching = WorkspaceWatch.watchFile(this.path, observedAtMs => {
      void Try(() => this.refresh(observedAtMs), {
        catch(error) {
          onError?.(error)
        },
      })
    })
    return await this.refresh(Time.timestampMs())
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
    this.stopWatching?.()
    for (const waiter of this.waiters) {
      waiter.reject(sourceFailure('Workspace source was closed: ' + this.path))
    }
    this.waiters.clear()
  }

  private async refresh(observedAtMs: number): Promise<UpdateResult> {
    const snapshot = await readSource(this.path, observedAtMs)
    const result = await this.compile(snapshot)
    this.onResult?.(result)
    for (const waiter of this.waiters) {
      if (waiter.source === snapshot.source) {
        waiter.resolve(result)
      }
    }
    return result
  }
}

type SourceWaiter = { source: string; resolve(result: UpdateResult): void; reject(error: unknown): void }

function sourceFailure(message: string): Errors.TaoError {
  return Try(() => Errors.ThrowHostEnvironment(message), {
    catch(error) {
      return Errors.fromUnknown(error)
    },
  })
}
