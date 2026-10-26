/** GeneratedRevision contains one complete mutable generated-source namespace. */
export type GeneratedRevision = {
  revision: string
  sequence: number
  files: Readonly<Record<string, string>>
}

/** PublicationOutcome distinguishes completed Metro work from preview application. */
export type PublicationOutcome = {
  sessionId: string
  revision: string
  sequence: number
  status: 'published' | 'noop' | 'superseded' | 'error' | 'poisoned'
  publishedRevision: string
  message?: string
}
