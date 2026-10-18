import type * as AST from '@ast-gen/AST'

/** ResolvedImport attaches filesystem targets to an authored use statement. */
export type ResolvedImport = {
  statement: AST.UseStatement | AST.UsePackageStatement
  targets: readonly ImportTarget[]
}

/** SourceModule owns an immutable source AST and its resolved import candidates. */
export type SourceModule = {
  path: string
  document: AST.Document
  imports: readonly ResolvedImport[]
  siblings: readonly string[]
}

/** ModuleBinding connects a local name to its declaration's owning source scope. */
export type ModuleBinding = { name: string; source: string; target: string }

/** LinkedModule retains declaration ownership and explicit or implicit imported names. */
export type LinkedModule = {
  path: string
  document: AST.Document
  bindings: readonly ModuleBinding[]
}

/** LinkedDefinition identifies a module-level value in initialization order. */
export type LinkedDefinition = { source: string; declaration: AST.LetDefinition }

/** LinkedProgram holds one entry file and the resolved modules used by full compilation. */
export type LinkedProgram = {
  entry: string
  modules: readonly LinkedModule[]
  definitions: readonly LinkedDefinition[]
}

type ImportRelation = 'same-file' | 'same-directory' | 'same-package' | 'same-project' | 'public'
type ImportTarget = { path: string; relation: ImportRelation }
