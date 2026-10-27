import * as AST from '@ast-gen/AST'
import type { SourceModule } from '../typecheck-src/Modules'

/** createSource builds a linked-module fixture with explicit path and siblings. */
export function createSource(
  path: string,
  declarations: readonly AST.Declaration[],
  siblings: readonly string[] = [],
): SourceModule {
  return {
    path,
    document: { root: { kind: 'File', start: 0, end: 0, block: createBlock(declarations) } },
    imports: [],
    siblings,
  }
}

/** createView builds a minimal injected view fixture with the requested visibility. */
export function createView(name: string, visibility: AST.Visibility = 'file'): AST.ViewDeclaration {
  return {
    kind: 'ViewDeclaration',
    start: 0,
    end: 0,
    name: createIdentifier(name),
    visibility,
    parameters: [],
    body: createViewBlock([{
      kind: 'RenderInjectStatement',
      start: 0,
      end: 0,
      injection: { kind: 'Injection', start: 0, end: 0, captures: [], code: '' },
    }]),
  }
}

/** createViewRender builds a render expression with optional child statements. */
export function createViewRender(
  target: string,
  children: readonly AST.ViewRenderBlockStatement[] = [],
): AST.ViewRenderExpression {
  return {
    kind: 'ViewRenderExpression',
    start: 0,
    end: 0,
    tag: undefined,
    target: createIdentifier(target),
    arguments: [],
    block: children.length > 0 ? createBlock(children) : undefined,
  }
}

/** createLetDefinition builds a text-valued let fixture with optional visibility. */
export function createLetDefinition(
  name: string,
  value = 'shadow',
  visibility?: AST.Visibility,
): AST.LetDeclaration {
  return {
    kind: 'LetDeclaration',
    start: 0,
    end: 0,
    name: createIdentifier(name),
    type: undefined,
    value: { kind: 'TextLiteral', start: 0, end: 0, value },
    visibility,
  }
}

/** createViewBlock builds a declaration block from its statements. */
export function createViewBlock(statements: readonly AST.ViewDeclarationStatement[]): AST.ViewDeclarationBlock {
  return createBlock(statements)
}

/** createBlock builds a typed AST block from its statements. */
export function createBlock<Statement extends AST.Node>(statements: readonly Statement[]): AST.Block<Statement> {
  return { kind: 'Block', start: 0, end: 0, statements }
}

/** createIdentifier builds an AST name fixture from its value. */
export function createIdentifier(value: string): AST.Name {
  return { kind: 'Name', start: 0, end: value.length, value }
}

/** createParameter builds a named parameter with its explicit Tao type. */
export function createParameter(name: string, type: string): AST.Parameter {
  return { kind: 'Parameter', start: 0, end: 0, name: createIdentifier(name), type: createIdentifier(type) }
}
