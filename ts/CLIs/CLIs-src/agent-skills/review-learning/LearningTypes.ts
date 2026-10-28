import { Range } from '@shared'

/** Correction retains human evidence separately from candidate detection. */
export type Correction = {
  id: string
  authority: 'explicit' | 'existing' | 'inferred'
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
  kind: 'call-name' | 'call-symbol' | 'function-length' | 'returned-method'
  name?: string
  declarationFile?: string
  declarationName?: string
  maxLines?: number
}

/** Finding marks a candidate needing contextual judgment before correction. */
export type Finding = { file: string; line: number; message: string; range: Range }

/** Scan freezes scope membership, content and configuration for reproducible coverage. */
export type Scan = {
  id: string
  correction: Correction
  queryVersion: number
  files: Record<string, string>
  inputs: Record<string, string>
  configs: Record<string, string>
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
  edits: ProposalEdit[]
  state?: 'pending' | 'applying' | 'applied'
  outputs?: Record<string, { before: string; after: string; done: boolean }>
}

type ProposalEdit = { file: string; expected: string; replacement: string; range: Range }

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
