import * as AST from '@ast-gen/AST'
import { Errors, S } from '@shared'
import { literal } from './codegen-util'
import { compileViewDeclaration } from './ViewsCompiler'

/** compileFile emits the app module for one Tao source file. */
export function compileFile(node: AST.File, revision: string): string {
  const apps = node.declarations.filter(AST.IsAppDeclaration)
  if (apps.length !== 1) {
    Errors.ThrowUserInput('Compile one app declaration per entry file.')
  }
  const app = apps[0]!
  const revisionLiteral = JSON.stringify(revision)
  const views = node.declarations.filter(AST.IsViewDeclaration)
    .map(compileViewDeclaration).join('\n')
  return S`
    import * as TR from '@runtime';
    TR.ModuleApplied(${revisionLiteral});
    const _views: Record<string, TR.View> = {};
    ${views}
    export default function App() {
      return TR.App(_views[${literal(app.root)}], ${revisionLiteral});
    }
  `
}
