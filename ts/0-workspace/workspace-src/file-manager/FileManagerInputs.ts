import { Timings } from '@shared'
import { Document, type DocumentSnapshot, IsDocument } from '../Document'
import type { UpdateResult } from '../Workspace'
import * as Compilation from './FileManagerCompilation'

/** SourceUpdateInput selects authored text or a manager-owned versioned document. */
export type SourceUpdateInput = string | Document

/** SourceSnapshotContext provides the document store and currently selected entry. */
export type SourceSnapshotContext = { documents: Map<string, Document>; entryPath?: string }

/** snapshotFileManagerInput captures a source version with its fresh top-level timing collector. */
export const snapshotFileManagerInput = Timings.createTopLevelTimer(
  (
    timings,
    context: SourceSnapshotContext,
    source: SourceUpdateInput,
    startedAtMs: number,
  ): Compilation.FileManagerInput => {
    const path = IsDocument(source) ? source.path : context.entryPath ?? '<memory>'
    const document = IsDocument(source) ? source : context.documents.get(path) ?? new Document(path)
    context.documents.set(path, document)
    const snapshot: DocumentSnapshot = IsDocument(source) ? source.snapshot() : document.replaceSource(source)
    return { kind: 'source', ...snapshot, startedAtMs, timings }
  },
)

/** createCompileRequest carries one loaded source and its queued request identity into compilation. */
export function createCompileRequest(
  request: Compilation.Pending,
  loaded: Compilation.LoadedSource,
): Compilation.CompileRequest {
  return {
    id: request.id,
    source: loaded.source,
    path: loaded.path,
    startedAtMs: loaded.startedAtMs,
    queuedAtMs: request.queuedAtMs,
    timings: loaded.timings,
    version: loaded.version,
  }
}

/** completeUnloadedInput retains request provenance when source acquisition produces a terminal result. */
export function completeUnloadedInput(request: Compilation.Pending, result: UpdateResult): Compilation.CompletedInput {
  const path = Compilation.resolveInputPath(request.input)
  return { result, path, source: '', version: undefined }
}
