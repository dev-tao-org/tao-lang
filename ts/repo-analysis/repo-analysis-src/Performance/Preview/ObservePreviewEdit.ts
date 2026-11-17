import { Errors, Time } from '@shared'
import type * as Workspace from '@workspace'
import { Document } from '@workspace'

/** PreviewEditFiles supplies versioned completion observations for one serialized harness edit. */
export type PreviewEditFiles = {
  getDocument(path: string): Pick<Document, PreviewDocumentField> | undefined
  onCompiled(listener: (event: Workspace.CompiledEvent) => void): () => unknown
}

/** observePreviewEdit waits for a fresh latest matching terminal completion after the caller writes.
 *  The caller must serialize writes and dispose the observation in its finally boundary. */
export function observePreviewEdit(
  files: PreviewEditFiles,
  path: string,
  source: string,
  pendingEdits: Set<() => void>,
  timeoutMs = 5000,
) {
  const previousVersion = files.getDocument(path)?.version ?? 0
  let resolve!: (result: Workspace.UpdateResult) => void
  let reject!: (error: unknown) => void
  const result = new Promise<Workspace.UpdateResult>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  const stop = files.onCompiled(event => {
    if (matchesFreshCompletion(files, event, { path, source, previousVersion })) {
      resolve(event.result)
    }
  })
  const cancel = Time.schedule(timeoutMs, () => reject(createEditFailure('Saved source was not observed: ' + path)))
  pendingEdits.add(abort)
  return { result, dispose }

  function dispose(): void {
    stop()
    cancel()
    pendingEdits.delete(abort)
  }

  function abort(): void {
    reject(createEditFailure('Preview harness closed before source compilation finished.'))
    dispose()
  }
}

type ExpectedPreviewEdit = { path: string; source: string; previousVersion: number }
type PreviewDocumentField = 'source' | 'version'

function matchesFreshCompletion(
  files: PreviewEditFiles,
  event: Workspace.CompiledEvent,
  expected: ExpectedPreviewEdit,
): boolean {
  const document = files.getDocument(expected.path)
  if (event.path !== expected.path || event.source !== expected.source) {
    return false
  }
  if (event.version === undefined || event.version <= expected.previousVersion) {
    return false
  }
  if (event.result.status === 'superseded') {
    return false
  }
  return event.version === document?.version && document.source === expected.source
}

function createEditFailure(message: string): Errors.TaoError {
  return Errors.createHostEnvironmentError(message)
}
