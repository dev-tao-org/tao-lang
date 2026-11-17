import * as AST from '@ast-gen'
import { NewlineCharacter } from '@shared'
import { Path } from '@shared/os'
import * as Typecheck from '@typecheck'

import { compileIdentifier, emitStringLiteral } from './codegen-util'

/** ForeignViewPathResolver maps an authored foreign-view path relative to its owning module. */
export type ForeignViewPathResolver = (modulePath: string, authoredPath: string, outputPath: string) => string

/** ForeignViewNamesByModuleMemberKey maps semantic foreign-view keys to generated import identifiers. */
export type ForeignViewNamesByModuleMemberKey = ReadonlyMap<string, string>

/** compileForeignViews resolves and imports every foreign view in a linked program. */
export function compileForeignViews(
  program: Typecheck.LinkedProgram,
  outputPath: string,
  resolvePath?: ForeignViewPathResolver,
): { imports: string; names: ForeignViewNamesByModuleMemberKey } {
  const declarations = collectForeignViewDeclarations(program)
  const resolvedViews = declarations.map(declaration => resolveForeignView(declaration, outputPath, resolvePath))
  const views = resolvedViews.sort(compareForeignViews)
  return compileForeignViewImports(views)
}

type ForeignViewDeclaration = {
  modulePath: string
  view: AST.ViewDeclaration
  authoredPath: string
  name: string
}

type OptionalForeignViewPathResolver = ForeignViewPathResolver | undefined

type ResolvedForeignView = ForeignViewDeclaration & { path: string }

function collectForeignViewDeclarations(program: Typecheck.LinkedProgram): ForeignViewDeclaration[] {
  const foreignViews: ForeignViewDeclaration[] = []
  for (const module of program.modules) {
    for (const view of AST.GetAllViewDeclarations(module.document)) {
      const authoredPath = AST.GetForeignViewPath(view)
      if (authoredPath) {
        const name = AST.GetViewName(view)
        foreignViews.push({ modulePath: module.path, view, authoredPath: authoredPath.value, name })
      }
    }
  }
  return foreignViews
}

function resolveForeignView(
  declaration: ForeignViewDeclaration,
  outputPath: string,
  resolvePath: OptionalForeignViewPathResolver,
): ResolvedForeignView {
  const path = resolvePath
    ? resolvePath(declaration.modulePath, declaration.authoredPath, outputPath)
    : Path.resolve(Path.dirname(declaration.modulePath), declaration.authoredPath)
  return { ...declaration, path }
}

function compareForeignViews(left: ResolvedForeignView, right: ResolvedForeignView): number {
  return left.path.localeCompare(right.path)
    || left.modulePath.localeCompare(right.modulePath)
    || left.name.localeCompare(right.name)
}

function compileForeignViewImports(
  views: readonly ResolvedForeignView[],
): { imports: string; names: ForeignViewNamesByModuleMemberKey } {
  const names = new Map<string, string>()
  const imports: string[] = []
  views.forEach((item, index) => {
    const alias = createForeignViewAlias(index)
    const key = Typecheck.createModuleMemberKey(item.modulePath, item.view.range.start)
    names.set(key, alias)
    imports.push(`import { ${compileIdentifier(item.view)} as ${alias} } from ${emitStringLiteral(item.path)};`)
  })
  const importText = imports.join(NewlineCharacter)
  return { imports: importText, names }
}

function createForeignViewAlias(index: number): string {
  return `_taoForeignView${index}`
}
