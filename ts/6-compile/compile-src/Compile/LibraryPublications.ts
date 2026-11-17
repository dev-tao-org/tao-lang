import * as AST from '@ast-gen'
import { Errors, UserInput } from '@shared'
import { Path, Platform } from '@shared/os'
import * as Typecheck from '@typecheck'

import { isTextParameter } from '../ValuesCompiler'

/** PublishedDefinition retains the owning source and canonical TypeScript export. */
export type PublishedDefinition = {
  subpath: string
  name: string
  source: string
  declaration: PublishableDeclaration
}

/** LibraryPublication selects one publish block, the current project's sources and named package roots. */
export type LibraryPublication = {
  declaration: AST.PublishDeclaration
  ownSources: ReadonlySet<string>
  packageRoots: PublishedPackageRoots
}

/** PublishedPackageRoots maps local published package names to their authored roots. */
export type PublishedPackageRoots = ReadonlyMap<string, string>

/** publishedDefinitionBinding names the shared implementation binding for a public declaration. */
export function publishedDefinitionBinding(definition: PublishedDefinition): string {
  const packageIdentity = Platform.hashText(definition.subpath).slice(0, 12)
  return `Published_${definition.name}_${packageIdentity}`
}

/** requireLibraryPublication selects the single publish block of a validated library. */
export function requireLibraryPublication(document: AST.Document, target?: string): AST.PublishDeclaration {
  const libraries = AST.GetTypeScriptLibraryDeclarations(document, target)
  if (libraries.length !== 1) {
    UserInput.fail(target ? `Unknown or ambiguous Tao library: ${target}.` : 'Select one ts-library declaration.')
  }
  const publication = AST.FindLibraryPublication(libraries[0]!)
  return publication ?? Errors.ThrowShouldNeverHappen('A validated ts-library declaration has no publish block.')
}

/** collectLibraryPublications resolves own-project package declarations selected for TypeScript export. */
export function collectLibraryPublications(
  program: Typecheck.LinkedProgram,
  publication: LibraryPublication,
): readonly PublishedDefinition[] {
  const entry = program.modules.find(module => module.path === program.entry)!
  const publications = publication.declaration.members.flatMap(member => {
    const name = member.value
    return name.startsWith('@')
      ? collectPackageDefinitions(program, publication, name)
      : [collectRootDefinition(program, publication, entry, name)]
  })
  assertUniquePublications(publications)
  return publications
}

function collectRootDefinition(
  program: Typecheck.LinkedProgram,
  publication: LibraryPublication,
  entry: Typecheck.LinkedModule,
  name: string,
): PublishedDefinition {
  const binding = entry.bindings.find(binding => binding.name === name)
  if (binding && binding.name !== binding.target) {
    UserInput.fail(`Publish ${binding.target} by its declaration name.`)
  }
  const source = binding?.source ?? entry.path
  const owner = program.modules.find(module => module.path === source)!
  const declaration = AST.FindValueDeclaration(owner.document, name)
  return requirePublishedDefinition(owner, declaration, '.', name, publication.ownSources)
}

function collectPackageDefinitions(
  program: Typecheck.LinkedProgram,
  publication: LibraryPublication,
  name: string,
): PublishedDefinition[] {
  const root = publication.packageRoots.get(name)
  if (root === undefined) {
    UserInput.fail(`Published package ${name} is not a local Tao package.`)
  }
  const publications = program.modules.flatMap(module => packageDefinitions(module, root, name, publication.ownSources))
  if (publications.length === 0) {
    UserInput.fail(`Published package ${name} has no package-visible declarations.`)
  }
  return publications
}

function packageDefinitions(
  module: Typecheck.LinkedModule,
  root: string,
  name: string,
  ownSources: ReadonlySet<string>,
): PublishedDefinition[] {
  if (!ownSources.has(module.path) || !Path.isWithin(root, module.path)) {
    return []
  }
  const directory = Path.toPortablePath(Path.relative(root, Path.dirname(module.path)))
  if (directory.split('/').some(part => part.startsWith('@'))) {
    return []
  }
  const subpath = directory ? `./${name}/${directory}` : `./${name}`
  return AST.GetValueDeclarations(module.document).filter(declaration => declaration.visibility === 'package')
    .map(declaration => requirePublishedDefinition(module, declaration, subpath, declaration.name.value, ownSources))
}

type PublishableDeclaration = AST.ViewDeclaration | AST.FunctionDeclaration

type CandidateDeclaration = AST.ValueDeclaration | undefined

function requirePublishedDefinition(
  owner: Typecheck.LinkedModule,
  declaration: CandidateDeclaration,
  subpath: string,
  name: string,
  ownSources: ReadonlySet<string>,
): PublishedDefinition {
  if (!ownSources.has(owner.path)) {
    UserInput.fail(`Cannot publish dependency definition ${name}.`)
  }
  if (!declaration || declaration.visibility !== 'package') {
    UserInput.fail(`Published definition ${name} must be an own-project package-visible declaration.`)
  }
  requirePublishableDefinition(declaration, name)
  return { subpath, name, source: owner.path, declaration }
}

function requirePublishableDefinition(
  node: AST.ValueDeclaration,
  name: string,
): asserts node is PublishableDeclaration {
  const supported = AST.IsKind(node, ['ViewDeclaration', 'FunctionDeclaration'])
  if (!supported || !node.parameters.every(isTextParameter)) {
    UserInput.fail(`TypeScript library publication ${name} supports views and pure functions with text parameters.`)
  }
}

function assertUniquePublications(publications: readonly PublishedDefinition[]): void {
  const addresses = new Set<string>()
  const declarations = new Set<string>()
  for (const definition of publications) {
    const address = publishedDefinitionKey(definition)
    const declaration = Typecheck.createModuleMemberKey(definition.source, definition.name)
    if (addresses.has(address) || declarations.has(declaration)) {
      UserInput.fail(`Duplicate published TypeScript export: ${address}.`)
    }
    addresses.add(address)
    declarations.add(declaration)
  }
}

function publishedDefinitionKey(definition: PublishedDefinition): string {
  return `${definition.subpath}/${definition.name}`
}
