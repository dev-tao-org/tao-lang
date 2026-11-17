import * as AST from '@ast-gen'
import { Errors, Switch } from '@shared'
import { emitAppBinding, emitFunctionDeclaration } from './RuntimeEmitter'
import { compileExpression, compileLetDeclaration } from './ValuesCompiler'
import { compileViewDeclaration, type ViewCompilationContext } from './ViewsCompiler'

/** DeclarationContext carries module facts shared by exhaustive declaration handlers. */
export type DeclarationContext = Omit<ViewCompilationContext, 'foreignComponent'> & {
  resolveForeignComponent(node: AST.ViewDeclaration): string | undefined
}

/** DeclarationCompilation separates component exports from lexical initialization. */
export type DeclarationCompilation = { initialization: string; components: string }

/** compileDeclaration dispatches concrete declaration kinds with their owning module context. */
export function compileDeclaration(node: AST.Declaration, context: DeclarationContext): DeclarationCompilation {
  return Switch.kind(node, {
    AppDeclaration: app => compileInitialization(emitAppBinding(app, context.scope)),
    LetDeclaration: declaration => compileInitialization(compileLetDeclaration(declaration, context.scope)),
    FunctionDeclaration: definition => compileInitialization(compileFunctionDefinition(definition, context.scope)),
    ViewDeclaration: view => compileViewDeclaration(view, createViewCompilationContext(view, context)),
    TestsDeclaration: omitRuntimeDeclaration,
    UseStatement: omitRuntimeDeclaration,
    RequiresDeclaration: omitRuntimeDeclaration,
    TypeScriptLibraryDeclaration: omitRuntimeDeclaration,
    PublishDeclaration: omitRuntimeDeclaration,
  })
}

function compileFunctionDefinition(node: AST.FunctionDeclaration, scope: string): string {
  const returned = AST.FindFunctionReturn(node)
  if (!returned) {
    Errors.ThrowShouldNeverHappen(`Missing return from validated function ${node.name.value}.`)
  }
  const result = compileExpression(returned.value, scope)
  return emitFunctionDeclaration(node, scope, result)
}

function createViewCompilationContext(
  view: AST.ViewDeclaration,
  context: DeclarationContext,
): ViewCompilationContext {
  const foreignComponent = context.resolveForeignComponent(view)
  return { ...context, foreignComponent }
}

function omitRuntimeDeclaration(): DeclarationCompilation {
  // Tests run through the test workflow; linking/setup already consumed imports and requirements.
  return compileInitialization('')
}

function compileInitialization(code: string): DeclarationCompilation {
  return { initialization: code, components: '' }
}
