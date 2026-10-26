import type * as AST from '@ast-gen/AST'
import { Switch } from '@shared'
import { emitAppBinding } from './RuntimeEmitter'
import { compileLetDeclaration } from './ValuesCompiler'
import { compileViewDeclaration, type ViewCompilationContext } from './ViewsCompiler'

/** DeclarationContext carries module facts shared by exhaustive declaration handlers. */
export type DeclarationContext = Omit<ViewCompilationContext, 'foreignComponent'> & {
  resolveForeignComponent(node: AST.ViewDeclaration): string | undefined
}

/** compileDeclaration dispatches concrete declaration kinds with their owning module context. */
export function compileDeclaration(node: AST.Declaration, context: DeclarationContext): string {
  return Switch.kind(node, {
    AppDeclaration: app => emitAppBinding(app, context.scope),
    LetDeclaration: declaration => compileLetDeclaration(declaration, context.scope),
    ViewDeclaration: view =>
      compileViewDeclaration(view, {
        ...context,
        foreignComponent: context.resolveForeignComponent(view),
      }),
    TestsDeclaration: omitRuntimeDeclaration,
    UseStatement: omitRuntimeDeclaration,
    UsePackageStatement: omitRuntimeDeclaration,
    RequiresDeclaration: omitRuntimeDeclaration,
  })
}

function omitRuntimeDeclaration(): string {
  // Tests run through the test workflow; linking/setup already consumed imports and requirements.
  return ''
}
