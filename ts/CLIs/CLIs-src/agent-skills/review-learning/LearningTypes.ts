/** Correction retains human evidence separately from candidate detection. */
export type Correction = {
  id: string
  authority: CorrectionAuthority
  evidence: string
  before: string
  after: string
  scope: string[]
  exceptions: string[]
  excludedPaths?: string[]
  supersedes?: string
  authoritySource?: { file: string; quote: string }
  rule: QueryRule
}

/** QueryRule selects a closed syntax or symbol query registry. */
export type QueryRule = {
  kind: QueryKind
  name?: string
  declarationFile?: string
  declarationName?: string
  maxLines?: number
}

/** Finding marks a candidate needing contextual judgment before correction. */
export type Finding = { file: string; start: number; end: number; line: number; message: string }

/** Scan freezes scope membership, content and configuration for reproducible coverage. */
export type Scan = {
  id: string
  correction: Correction
  queryVersion: number
  files: LearningFileHashes
  inputs: LearningFileHashes
  configs: LearningFileHashes
  selected: string[]
  complete: boolean
  findings: Finding[]
}

/** Proposal retains exact edits plus the reasoning needed to apply equivalent corrections. */
export type Proposal = {
  id: string
  scan: string
  analysis: string
  protectedFiles?: string[]
  edits: LearningEdit[]
  state?: ProposalState
  outputs?: Record<string, { before: string; after: string; done: boolean }>
}

/** LearningState is the append-only correction and scan history with a pending patch queue. */
export type LearningState = {
  version: 1
  root: string
  corrections: Correction[]
  scans: Scan[]
  proposals: Proposal[]
  protectedFiles: string[]
  events: { group: string; scans: string[]; pending: string[] }[]
}

/** LearningFileHashes maps repository-relative paths to their retained content hashes. */
export type LearningFileHashes = Record<string, string>

/** LearningSnapshot retains source membership and configuration identities for a scan. */
export type LearningSnapshot = Pick<Scan, LearningSnapshotFields>

type CorrectionAuthority = 'explicit' | 'existing' | 'inferred'
type QueryKind = 'call-name' | 'call-symbol' | 'function-length' | 'returned-method'
type ProposalState = 'pending' | 'applying' | 'applied'
type LearningEdit = { file: string; start: number; end: number; expected: string; replacement: string }
type LearningSnapshotFields = 'files' | 'inputs' | 'configs'
