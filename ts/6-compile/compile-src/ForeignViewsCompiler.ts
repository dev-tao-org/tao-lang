import * as AST from '@ast-gen/AST'
import { Path } from '@shared/os'
import { createModuleMemberKey, type LinkedProgram } from '@typecheck/Modules'
import { compileIdentifier, emitStringLiteral } from './codegen-util'

/** ForeignViewPathResolver maps an authored foreign-view path relative to its owning module. */
export type ForeignViewPathResolver = (modulePath: string, authoredPath: string) => string

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

function resolveForeignViewPaths(
  declarations: readonly ForeignViewDeclaration[],
  resolvePath?: ForeignViewPathResolver,
): ResolvedForeignView[] {
  return declarations.map(declaration => resolveForeignView(declaration, resolvePath))
}

function resolveForeignView(
  declaration: ForeignViewDeclaration,
  resolvePath: ForeignViewPathResolver | undefined,
): ResolvedForeignView {
  const path = resolvePath
    ? resolvePath(declaration.modulePath, declaration.authoredPath)
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
): { imports: string; names: ReadonlyMap<string, string> } {
  const names = new Map<string, string>()
  const imports: string[] = []
  views.forEach((item, index) => {
    const alias = createForeignViewAlias(index)
    const key = createModuleMemberKey(item.modulePath, item.view.start)
    names.set(key, alias)
    imports.push(`import { ${compileIdentifier(item.view)} as ${alias} } from ${emitStringLiteral(item.path)};`)
  })
  const importText = imports.join('\n')
  return { imports: importText, names }
}

function createForeignViewAlias(index: number): string {
  return `_taoForeignView${index}`
}
