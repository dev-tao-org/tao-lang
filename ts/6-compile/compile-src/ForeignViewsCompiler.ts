import * as AST from '@ast-gen/AST'
import { Path } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import { compileIdentifier, emitStringLiteral } from './codegen-util'

/** ForeignViewPathResolver maps an authored foreign-view path relative to its owning module. */
export type ForeignViewPathResolver = (modulePath: string, authoredPath: string) => string

/** getForeignViewKey identifies one foreign view by owning module and source position. */
export function getForeignViewKey(modulePath: string, start: number): string {
  // NUL separates the module path from the source offset in this composite key.
  return `${modulePath}\u0000${start}`
}

/** compileForeignViews resolves and imports every foreign view in a linked program. */
export function compileForeignViews(
  program: LinkedProgram,
  resolvePath?: ForeignViewPathResolver,
): { imports: string; names: ReadonlyMap<string, string> } {
  const declarations = collectForeignViewDeclarations(program)
  const resolvedViews = resolveForeignViewPaths(declarations, resolvePath)
  const views = resolvedViews.sort(compareForeignViews)
  return compileForeignViewImports(views)
}

type ForeignViewDeclaration = {
  modulePath: string
  view: AST.ViewDeclaration
  authoredPath: string
  name: string
}

type ResolvedForeignView = ForeignViewDeclaration & { path: string }

function collectForeignViewDeclarations(program: LinkedProgram): ForeignViewDeclaration[] {
  const foreignViews: ForeignViewDeclaration[] = []
  for (const module of program.modules) {
    for (const view of AST.GetViewDeclarations(module.document)) {
      const authoredPath = AST.GetForeignViewPath(view)
      if (authoredPath) {
        const name = AST.GetViewName(view)
        foreignViews.push({ modulePath: module.path, view, authoredPath: authoredPath.value, name })
      }
    }
  }
  return foreignViews
}

function resolveForeignViewPaths(
  declarations: readonly ForeignViewDeclaration[],
  resolvePath?: ForeignViewPathResolver,
): ResolvedForeignView[] {
  return declarations.map(declaration => ({
    ...declaration,
    path: resolvePath
      ? resolvePath(declaration.modulePath, declaration.authoredPath)
      : Path.resolve(Path.dirname(declaration.modulePath), declaration.authoredPath),
  }))
}

function compareForeignViews(left: ResolvedForeignView, right: ResolvedForeignView): number {
  return left.path.localeCompare(right.path)
    || left.modulePath.localeCompare(right.modulePath)
    || left.name.localeCompare(right.name)
}

function compileForeignViewImports(
  views: readonly ResolvedForeignView[],
): { imports: string; names: ReadonlyMap<string, string> } {
  const names = new Map<string, string>()
  const imports: string[] = []
  views.forEach((item, index) => {
    const alias = createForeignViewAlias(index)
    names.set(getForeignViewKey(item.modulePath, item.view.start), alias)
    imports.push(`import { ${compileIdentifier(item.view)} as ${alias} } from ${emitStringLiteral(item.path)};`)
  })
  const importText = imports.join('\n')
  return { imports: importText, names }
}

function createForeignViewAlias(index: number): string {
  return `_taoForeignView${index}`
}
