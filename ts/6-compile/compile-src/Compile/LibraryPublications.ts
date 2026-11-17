import * as AST from '@ast-gen'
import { Errors } from '@shared'
import { Path, Platform } from '@shared/os'
import * as Typecheck from '@typecheck'

import { isTextParameter } from '../ValuesCompiler'

/** PublishedView retains the owning source and canonical TypeScript export. */
export type PublishedView = {
  subpath: string
  name: string
  source: string
  declaration: AST.ViewDeclaration
}

/** LibraryPublication selects one publish block, the current project's sources and named package roots. */
export type LibraryPublication = {
  declaration: AST.PublishDeclaration
  ownSources: ReadonlySet<string>
  packageRoots: PublishedPackageRoots
}

/** PublishedPackageRoots maps local published package names to their authored roots. */
export type PublishedPackageRoots = ReadonlyMap<string, string>

/** publishedViewBinding names the shared implementation binding for a public component. */
export function publishedViewBinding(view: PublishedView): string {
  const packageIdentity = Platform.hashText(view.subpath).slice(0, 12)
  return `Published_${view.name}_${packageIdentity}`
}

/** requireLibraryPublication selects the single publish block of a validated library. */
export function requireLibraryPublication(document: AST.Document, target?: string): AST.PublishDeclaration {
  const libraries = AST.GetTypeScriptLibraryDeclarations(document, target)
  if (libraries.length !== 1) {
    Errors.ThrowUserInput(
      target ? `Unknown or ambiguous Tao library: ${target}.` : 'Select one ts-library declaration.',
    )
  }
  const publication = AST.FindLibraryPublication(libraries[0]!)
  return publication ?? Errors.ThrowShouldNeverHappen('A validated ts-library declaration has no publish block.')
}

/** collectLibraryPublications resolves explicit own-project public views and local package APIs. */
export function collectLibraryPublications(
  program: Typecheck.LinkedProgram,
  publication: LibraryPublication,
): readonly PublishedView[] {
  const entry = program.modules.find(module => module.path === program.entry)!
  const views = publication.declaration.members.flatMap(member => {
    const name = member.value
    return name.startsWith('@')
      ? collectPackageViews(program, publication, name)
      : [collectRootView(program, publication, entry, name)]
  })
  assertUniquePublications(views)
  return views
}

function collectRootView(
  program: Typecheck.LinkedProgram,
  publication: LibraryPublication,
  entry: Typecheck.LinkedModule,
  name: string,
): PublishedView {
  const binding = entry.bindings.find(binding => binding.name === name)
  if (binding && binding.name !== binding.target) {
    Errors.ThrowUserInput(`Publish ${binding.target} by its declaration name.`)
  }
  const source = binding?.source ?? entry.path
  const owner = program.modules.find(module => module.path === source)!
  const declaration = AST.FindValueDeclaration(owner.document, name)
  return requirePublishedView(owner, declaration, '.', name, publication.ownSources)
}

function collectPackageViews(
  program: Typecheck.LinkedProgram,
  publication: LibraryPublication,
  name: string,
): PublishedView[] {
  const root = publication.packageRoots.get(name)
  if (root === undefined) {
    Errors.ThrowUserInput(`Published package ${name} is not a local Tao package.`)
  }
  const views = program.modules.flatMap(module => packageViews(module, root, name, publication.ownSources))
  if (views.length === 0) {
    Errors.ThrowUserInput(`Published package ${name} has no public declarations.`)
  }
  return views
}

function packageViews(
  module: Typecheck.LinkedModule,
  root: string,
  name: string,
  ownSources: ReadonlySet<string>,
): PublishedView[] {
  if (!ownSources.has(module.path) || !Path.isWithin(root, module.path)) {
    return []
  }
  const directory = Path.toPortablePath(Path.relative(root, Path.dirname(module.path)))
  if (directory.split('/').some(part => part.startsWith('@'))) {
    return []
  }
  const subpath = directory ? `./${name}/${directory}` : `./${name}`
  return AST.GetValueDeclarations(module.document).filter(declaration => declaration.visibility === 'public')
    .map(declaration => requirePublishedView(module, declaration, subpath, declaration.name.value, ownSources))
}

type CandidateViewDeclaration = AST.ValueDeclaration | undefined

function requirePublishedView(
  owner: Typecheck.LinkedModule,
  declaration: CandidateViewDeclaration,
  subpath: string,
  name: string,
  ownSources: ReadonlySet<string>,
): PublishedView {
  if (!ownSources.has(owner.path)) {
    Errors.ThrowUserInput(`Cannot publish dependency definition ${name}.`)
  }
  if (!declaration || declaration.visibility !== 'public') {
    Errors.ThrowUserInput(`Published definition ${name} must be an own-project public declaration.`)
  }
  if (!AST.IsViewDeclaration(declaration) || !declaration.parameters.every(isTextParameter)) {
    Errors.ThrowUserInput(`TypeScript library publication ${name} supports only views with text parameters.`)
  }
  return { subpath, name, source: owner.path, declaration }
}

function assertUniquePublications(views: readonly PublishedView[]): void {
  const addresses = new Set<string>()
  const declarations = new Set<string>()
  for (const view of views) {
    const address = publishedViewKey(view)
    const declaration = Typecheck.createModuleMemberKey(view.source, view.name)
    if (addresses.has(address) || declarations.has(declaration)) {
      Errors.ThrowUserInput(`Duplicate published TypeScript export: ${address}.`)
    }
    addresses.add(address)
    declarations.add(declaration)
  }
}

function publishedViewKey(view: PublishedView): string {
  return `${view.subpath}/${view.name}`
}
