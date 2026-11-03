import { Errors, Lists, NewlineCharacter, Try } from '@shared'
import * as MetroPlatform from '@shared/os/metro'

import { assertMetroNotLoaded } from '../../bridges/Bridge_metro'
import { createRevisionOwner, type RevisionOwner, type RevisionResult, snapshotRevision } from '../GeneratedRevision'
import type { GeneratedRevision, GeneratedSourceFiles } from '../PreviewProtocol'
import { createMetroAdmission, type MetroAdmission } from './MetroAdmission'
import { installMetroHooks } from './MetroHooks'

/** MetroAdapter exposes publication and binds the already running Expo Metro server. */
export type MetroAdapter = { owner: RevisionOwner; attach(metro: MetroServer): void }
/** createMetroAdapter installs the generated namespace before Expo imports filesystem readers.
 *  Only this owner changes visible source bytes. A confirmed precommit error restores the old volume;
 *  partial FileMap commits poison the whole session. Build errors retain bytes for the next correction. */
export function createMetroAdapter(options: MetroAdapterOptions): MetroAdapter {
  assertMetroNotLoaded(options.directory)
  const initial = snapshotRevision(options.initial)
  const fileSystem = MetroPlatform.GeneratedFileSystem.installGeneratedFileSystem(
    MetroPlatform.Path.join(options.directory, 'src'),
    initial.files,
  )
  const admission = createMetroAdmission()
  const state: AdapterState = { current: initial, errors: [], poisoned: false, fileSystem, admission, options }
  const owner = createRevisionOwner(options.sessionId, initial, revision => commitRevision(state, revision))
  installMetroHooks({
    directory: options.directory,
    sessionId: options.sessionId,
    admission,
    current: () => state.current,
    reportError: message => recordBuildError(state, message),
    reportFatal(message) {
      state.poisoned = true
      admission.poison()
      recordBuildError(state, message)
    },
  })
  return {
    owner,
    attach(metro) {
      if (state.metro) {
        Errors.ThrowHostEnvironment('Only one Metro server may own a generated session.')
      }
      assertSupportedConfiguration(metro)
      state.metro = metro
    },
  }
}

/** MetroAdapterOptions seeds one generated publication owner in the dedicated Metro process. */
export type MetroAdapterOptions = { directory: string; sessionId: string; initial: GeneratedRevision }

/** MetroServer describes only the pinned private access needed for explicit FileMap batches. */
export type MetroServer = {
  _config: { projectRoot: string; maxWorkers: number; resolver: { useWatchman: boolean } }
  getBundler(): { getBundler(): { getDependencyGraph(): Promise<{ getWatcher(): ExternalFileMap }> } }
}

type AdapterState = {
  current: GeneratedRevision
  errors: string[]
  poisoned: boolean
  fileSystem: MetroPlatform.GeneratedFileSystem.GeneratedFileSystem
  admission: MetroAdmission
  options: MetroAdapterOptions
  metro?: MetroServer
}
type ExternalChange = {
  event: ExternalChangeEvent
  root: string
  relativePath: string
  metadata?: { type: 'f'; size: number; modifiedTime: number }
}
type ExternalChangeEvent = 'touch' | 'delete'
type ExternalFileMap = { __expo: boolean; applyExternalBatch(changes: ExternalChange[]): Promise<{ changed: number }> }

async function commitRevision(state: AdapterState, revision: GeneratedRevision): Promise<RevisionResult> {
  const changed = resolveChangedPaths(state.current.files, revision.files)
  if (changed.length === 0) {
    return { status: 'noop' }
  }
  const staged = state.fileSystem.stage(revision.files)
  return await state.admission.publish(async () => {
    const metro = state.metro ?? Errors.ThrowHostEnvironment('Metro publication is not ready.')
    const graph = await metro.getBundler().getBundler().getDependencyGraph()
    const map = graph.getWatcher()
    assertExternalMap(map)
    const previous = state.fileSystem.replace(staged)
    const previousRevision = state.current
    state.current = revision
    state.errors = []
    return await Try(async () => {
      const changes = createChanges(state, metro._config.projectRoot, changed)
      await map.applyExternalBatch(changes)
      return { status: 'published' as const }
    }, {
      catch(error) {
        if (requiresRestart(error)) {
          state.admission.poison()
          return { status: 'poisoned' as const, message: String(error) }
        }
        state.fileSystem.replace(previous)
        state.current = previousRevision
        return { status: 'error' as const, message: String(error) }
      },
    })
  }).then(result => completeRevision(state, result))
}

function completeRevision(state: AdapterState, result: RevisionResult): RevisionResult {
  if (state.poisoned) {
    return { status: 'poisoned', message: state.errors.join(NewlineCharacter) }
  }
  return state.errors.length > 0 && result.status === 'published'
    ? { status: 'error', committed: true, message: state.errors.join(NewlineCharacter) }
    : result
}

function recordBuildError(state: AdapterState, message: string): void {
  if (state.errors.length < 8 && !state.errors.includes(message)) {
    state.errors.push(message)
  }
}

function assertExternalMap(map: ExternalFileMap): void {
  if (!map.__expo || typeof map.applyExternalBatch !== 'function') {
    Errors.ThrowHostEnvironment('Metro requires the pinned explicit FileMap patch. Restart with the prepared runtime.')
  }
}

function assertSupportedConfiguration(metro: MetroServer): void {
  if (metro._config.maxWorkers !== 1 || metro._config.resolver.useWatchman !== false) {
    Errors.ThrowHostEnvironment('Generated Metro sessions require one in-process worker and Watchman disabled.')
  }
}

function resolveChangedPaths(
  previous: GeneratedSourceFiles,
  next: GeneratedSourceFiles,
): string[] {
  return Lists.unique(Object.keys(previous), Object.keys(next)).filter(path => previous[path] !== next[path])
}

function createChanges(state: AdapterState, root: string, paths: string[]): ExternalChange[] {
  return paths.map(path => {
    const relativePath = MetroPlatform.Path.relative(
      root,
      MetroPlatform.Path.join(state.options.directory, 'src', path),
    ).replaceAll('\\', '/')
    return Object.hasOwn(state.current.files, path)
      ? { event: 'touch', root, relativePath, metadata: state.fileSystem.metadata(path) }
      : { event: 'delete', root, relativePath }
  })
}

function requiresRestart(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('requiresRestart' in error)) {
    return false
  }
  return error.requiresRestart === true
}
