import type * as AST from '@ast-gen'
import { NullCharacter } from '@shared'
import type { ScalarTypeScope } from '../ScalarTypes'

type ModuleMember = string | number
/** createModuleMemberKey identifies a module-owned member by name, authored path or source offset. */
export function createModuleMemberKey(modulePath: string, member: ModuleMember): string {
  return `${modulePath}${NullCharacter}${member}`
}

/** SourceModule owns an immutable source AST and its resolved import candidates. */
export type SourceModule = {
  path: string
  document: AST.Document
  imports: readonly ResolvedImport[]
  siblings: readonly string[]
  project?: SourceProject
}

/** SourceProject identifies the enclosing project and its first resolved dependency alias. */
export type SourceProject = { root: string; alias?: string }

/** ModuleBinding connects a local name to its declaration's owning source scope. */
export type ModuleBinding = { name: string; source: string; target: string }

/** ModuleBinding creates a linked name and its owning source declaration reference. */
export const ModuleBinding = (name: string, source: string, target: string): ModuleBinding => ({ name, source, target })

/** LinkedModule retains declaration ownership and explicit or implicit imported names. */
export type LinkedModule = {
  path: string
  document: AST.Document
  bindings: readonly ModuleBinding[]
  scalarTypes: ScalarTypeScope
  imports: SourceModule['imports']
  project?: SourceProject
}

/** LinkedDefinition identifies a module-level value in initialization order. */
export type LinkedDefinition = { source: string; declaration: AST.LetDeclaration }

/** LinkedProgram holds one entry file and the resolved modules used by full compilation. */
export type LinkedProgram = {
  entry: string
  modules: readonly LinkedModule[]
  definitions: readonly LinkedDefinition[]
}

type ResolvedImport = {
  statement: AST.UseStatement
  targets: readonly ImportTarget[]
}

type ImportRelation = 'same-file' | 'same-directory' | 'package-api'
type ImportTarget = { path: string; relation: ImportRelation }
