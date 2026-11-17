import type * as AST from '@ast-gen'
import { NullCharacter, Regxs } from '@shared'

/** ImportStatement identifies one authored module import form. */
export type ImportStatement = AST.UseStatement | AST.UsePackageStatement

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

/** deriveNamespaceFromPath returns the default namespace of a package import. */
export function deriveNamespaceFromPath(path: string): string | undefined {
  // ex: ../@Foo.tao/ -> [@Foo.tao]
  const parts = path.split('/').filter(isNamedImportPathSegment)
  // ex: [@Foo.tao] -> @Foo
  const last = parts.at(-1)?.replace(Regxs.TaoSourceExtensionRegx, '')
  // ex: @Foo -> Foo
  const name = last?.startsWith('@') ? last.slice(1) : last
  return isTaoIdentifier(name) ? name : undefined
}

function isNamedImportPathSegment(part: string): boolean {
  return part !== '' && part !== '.' && part !== '..'
}

type TaoIdentifierInput = string | undefined

function isTaoIdentifier(name: TaoIdentifierInput): name is string {
  // ex: Foo -> true | ex: Foo-bar -> false
  return name !== undefined && Regxs.TaoIdentifierRegx.test(name)
}

type ResolvedImport = {
  statement: ImportStatement
  targets: readonly ImportTarget[]
}

type ImportRelation = 'same-file' | 'same-directory' | 'same-package' | 'same-project' | 'public'
type ImportTarget = { path: string; relation: ImportRelation }
