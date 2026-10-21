/** ReviewSession records the source and owned reviewed checkout for one review. */
export type ReviewSession = {
  version: 1
  id: string
  root: string
  sourceBranch: string
  reviewedBranch: string
  reviewedRoot: string
  base: string
  baseCommit: string
  directory: string
  accepted: Record<string, string>
  recheck: string[]
  notes: string[]
}

/** ReviewSelection freezes candidate trees and the exact source snapshot that was shown. */
export type ReviewSelection = {
  version: 1
  proposal: string
  session: string
  sourceHead: string
  reviewedHead: string
  files: string[]
  diskTree: string
  indexTree: string
  sourceTree: string
  reviewedTree: string
  reconciledIndexTree: string
  kind: 'files' | 'partial' | 'reopen'
}

/** ReviewJournal retains both commits before either branch advances. */
export type ReviewJournal = {
  selection: ReviewSelection
  sourceCommit: string
  reviewedCommit: string
  originalIndexHash: string
  reconciledIndexHash: string
  reconciledIndex: string
  phase: 'prepared' | 'source' | 'index' | 'reviewed' | 'complete'
}

/** ReviewHooks supplies a fixture-only interruption between branch updates. */
export type ReviewHooks = {
  atPhase?: (point: 'source' | 'index' | 'reviewed-tree' | 'reviewed-ref' | 'session') => void | Promise<void>
}
