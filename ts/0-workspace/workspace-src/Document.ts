/** DocumentSnapshot freezes a source version at the moment it enters a work queue. */
export type DocumentSnapshot = {
  readonly path: string
  readonly source: string
  readonly version: number
}

/** Document owns one Tao source path and its current complete in-memory text. */
export class Document {
  private currentSource: string
  private currentVersion = 0

  constructor(readonly path: string, source = '') {
    this.currentSource = source
  }

  get source(): string {
    return this.currentSource
  }

  get version(): number {
    return this.currentVersion
  }

  /** replaceSource installs full source text and advances the document version. */
  replaceSource(source: string): DocumentSnapshot {
    this.currentSource = source
    this.currentVersion++
    return this.snapshot()
  }

  /** snapshot returns an immutable copy that later document edits cannot change. */
  snapshot(): DocumentSnapshot {
    return Object.freeze({ path: this.path, source: this.currentSource, version: this.currentVersion })
  }
}

/** IsDocument identifies a manager-owned document without accepting lookalike source records. */
export function IsDocument(value: unknown): value is Document {
  return value instanceof Document
}
