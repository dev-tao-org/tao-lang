import * as AST from '@ast-gen'
import { Errors } from '@shared'
import * as Typecheck from '@typecheck'

import { hasSupportedViewParameters } from '../ValuesCompiler'

/** PublishedView retains source ownership and the public package subpath of a Tao view. */
export type PublishedView = { path: string; source: string; declaration: AST.ViewDeclaration }

/** compilePublicationExportName identifies a public component consistently across package entrypoints. */
export function compilePublicationExportName(index: number): string {
  return `Published${index}`
}

/** collectLibraryPublications resolves explicit own-project public views and selected module lists. */
export function collectLibraryPublications(
  program: Typecheck.LinkedProgram,
  ownSources: ReadonlySet<string>,
  target?: string,
): readonly PublishedView[] {
  const entry = program.modules.find(module => module.path === program.entry)!
  const libraries = [...AST.GetTypeScriptLibraryDeclarations(entry.document, target)]
  if (libraries.length !== 1) {
    Errors.ThrowUserInput(
      target ? `Unknown or ambiguous Tao library: ${target}.` : 'Select one ts-library declaration.',
    )
  }
  const publication = AST.FindLibraryPublication(libraries[0]!)
  if (!publication) {
    Errors.ThrowShouldNeverHappen('A validated ts-library declaration has no publish block.')
  }
  const views = publication.members.flatMap(member => collectSelectedPublication(program, entry, member, ownSources))
  const paths = new Set<string>()
  for (const view of views) {
    if (paths.has(view.path)) {
      Errors.ThrowUserInput(`Duplicate published TypeScript path: ${view.path}.`)
    }
    paths.add(view.path)
  }
  return views
}

function collectSelectedPublication(
  program: Typecheck.LinkedProgram,
  entry: Typecheck.LinkedModule,
  member: AST.Name,
  ownSources: ReadonlySet<string>,
): PublishedView[] {
  const name = member.value
  const importedModule = entry.imports.find(imported => {
    const statement = imported.statement
    return AST.IsUsePackageStatement(statement)
      && (statement.alias?.value ?? Typecheck.deriveNamespaceFromPath(statement.from.value)) === name
  })
  if (!importedModule) {
    const binding = entry.bindings.find(binding => binding.name === name)
    const source = binding?.source ?? entry.path
    const owner = program.modules.find(module => module.path === source)!
    return [requirePublishedView(owner, binding?.target ?? name, name, ownSources)]
  }
  const sources = new Set(importedModule.targets.map(target => target.path))
  const lists = program.modules.filter(module => sources.has(module.path)).flatMap(module =>
    AST.GetPublishDeclarations(module.document)
  )
  if (lists.length !== 1) {
    Errors.ThrowUserInput(`Published module ${name} must declare one publish block.`)
  }
  return lists[0]!.members.map(selected => {
    const binding = entry.bindings.find(binding => binding.name === `${name}.${selected.value}`)
    if (!binding || !sources.has(binding.source)) {
      return Errors.ThrowUserInput(`Published definition ${selected.value} must be an own-project public declaration.`)
    }
    const owner = program.modules.find(module => module.path === binding.source)!
    const path = `${name}/${selected.value}`
    return requirePublishedView(owner, binding.target, path, ownSources)
  })
}

function requirePublishedView(
  owner: Typecheck.LinkedModule,
  name: string,
  path: string,
  ownSources: ReadonlySet<string>,
): PublishedView {
  if (!ownSources.has(owner.path)) {
    Errors.ThrowUserInput(`Cannot publish dependency definition ${name}.`)
  }
  const declaration = AST.FindValueDeclaration(owner.document, name)
  if (!declaration || declaration.visibility !== 'public') {
    Errors.ThrowUserInput(`Published definition ${name} must be an own-project public declaration.`)
  }
  if (!AST.IsViewDeclaration(declaration) || !hasSupportedViewParameters(declaration)) {
    Errors.ThrowUserInput(`TypeScript library publication ${name} supports only views with text or boolean parameters.`)
  }
  return { path, source: owner.path, declaration }
}
