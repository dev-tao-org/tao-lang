import * as AST from '@ast-gen/AST'
import { Errors, S, Switch } from '@shared'
import { literal } from './codegen-util'
import { compileLetDefinition, textBindings } from './ValuesCompiler'
import { compileViewDeclaration } from './ViewsCompiler'

/** compileFile emits the app module for one Tao source file. */
export function compileFile(node: AST.File, revision: string, appName?: string): string {
  const apps = node.declarations.filter(AST.IsAppDeclaration)
  if (!appName && apps.length !== 1) {
    Errors.ThrowUserInput('Compile one app declaration per entry file.')
  }
  const app = (appName ? apps.find(candidate => candidate.name.value === appName) : apps[0])
    ?? Errors.ThrowUserInput(`Unknown Tao app: ${appName ?? '(none)'}.`)
  const revisionLiteral = JSON.stringify(revision)
  const bindings = textBindings(node.declarations.filter(AST.IsLetDefinition))
  const declarations = node.declarations.map(declaration => compileDeclaration(declaration, bindings)).join('\n')
  return S`
    import * as TR from '@runtime';
    TR.ModuleApplied(${revisionLiteral});
    const _views: Record<string, TR.View> = {};
    const _scope = TR.Scope();
    ${declarations}
    export default function App() {
      return TR.App(_views[${literal(app.root)}], ${revisionLiteral});
    }
  `
}

function compileDeclaration(node: AST.File['declarations'][number], bindings: ReadonlySet<string>): string {
  return Switch.kind(node, {
    AppDeclaration: () => '',
    TestsDeclaration: () => '',
    LetDefinition: definition => compileLetDefinition(definition, '_scope'),
    ViewDeclaration: view => compileViewDeclaration(view, bindings),
  })
}
