/** GeneratedRevision contains one complete mutable generated-source namespace. */
export type GeneratedRevision = {
  revision: string
  sequence: number
  files: GeneratedSourceFiles
}

/** GeneratedSourceFiles maps generated source paths to their complete text contents. */
export type GeneratedSourceFiles = Readonly<Record<string, string>>

/** PublicationOutcome distinguishes completed Metro work from preview application. */
export type PublicationOutcome = {
  sessionId: string
  revision: string
  sequence: number
  status: PublicationStatus
  publishedRevision: string
  message?: string
}

type PublicationStatus = 'published' | 'noop' | 'superseded' | 'error' | 'poisoned'
