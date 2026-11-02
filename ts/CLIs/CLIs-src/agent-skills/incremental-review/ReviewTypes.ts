/** IncrementalReviewResult preserves the response contracts of the review commands. */
export type IncrementalReviewResult =
  | { commands: string[]; scope: string }
  | { session: string; reviewedBranch: string; reviewedRoot: string }
  | { proposal: string; sourceDiff: string; reviewedDiff: string }
  | { accepted: string[]; kind: ReviewSelection['kind'] }
  | { reopened: string[] }
  | { reviewedBranch: string }
  | { recovered: true }
  | { notes: string[]; recheck: string[] }
  | ReviewStatus

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
  accepted: AcceptedPathEntries
  recheck: string[]
  notes: string[]
  continuation?: { session: string; root: string; reviewedBranch: string; reviewedHead: string }
}

/** ReviewStatus reports the implementation snapshot against the owned reviewed checkout. */
export type ReviewStatus = {
  sourceBranch: string
  sourceHead: string
  reviewedBranch: string
  reviewedHead: string
  reviewedRoot: string
  pending: string
  recheck: string[]
  notes: string[]
  journal: OptionalReviewJournalPhase
  outline: string
  comparison: string
  gitLens: string
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
  kind: ReviewSelectionKind
}

/** ReviewJournal retains both commits before either branch advances. */
export type ReviewJournal = {
  selection: ReviewSelection
  sourceCommit: string
  reviewedCommit: string
  originalIndexHash: string
  reconciledIndexHash: string
  reconciledIndex: string
  phase: ReviewJournalPhase
}

type ReviewSelectionKind = 'files' | 'partial' | 'reopen'
type AcceptedPathEntries = Record<string, string>
type ReviewJournalPhase = 'prepared' | 'source' | 'index' | 'reviewed' | 'complete'
type OptionalReviewJournalPhase = ReviewJournalPhase | undefined
