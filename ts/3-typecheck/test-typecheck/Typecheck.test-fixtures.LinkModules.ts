import * as AST from '@ast-gen'
import { Range } from '@shared'
import type { SourceModule } from '../typecheck-src/Typecheck'

/** createSource builds a linked-module fixture with explicit path and siblings. */
export function createSource(
  path: string,
  declarations: readonly AST.Declaration[],
  siblings: readonly string[] = [],
): SourceModule {
  return {
    path,
    document: { root: { kind: 'File', range: Range(), block: createBlock(declarations) } },
    imports: [],
    siblings,
  }
}

/** createView builds a minimal injected view fixture with the requested visibility. */
export function createView(name: string, visibility?: AST.Visibility): AST.ViewDeclaration {
  return {
    kind: 'ViewDeclaration',
    range: Range(),
    name: createIdentifier(name),
    visibility,
    parameters: [],
    body: createViewBlock([{
      kind: 'RenderInjectStatement',
      range: Range(),
      injection: { kind: 'Injection', range: Range(), captures: [], code: '' },
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
    interaction: undefined,
    range: Range(),
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
    range: Range(),
    name: createIdentifier(name),
    type: undefined,
    value: { kind: 'TextLiteral', range: Range(), value },
    visibility,
  }
}

/** createViewBlock builds a declaration block from its statements. */
export function createViewBlock(statements: readonly AST.ViewDeclarationStatement[]): AST.Block {
  return createBlock(statements)
}

/** createBlock builds a typed AST block from its statements. */
export function createBlock(statements: readonly AST.Statement[]): AST.Block {
  return { kind: 'Block', range: Range(), statements }
}

/** createIdentifier builds an AST name fixture from its value. */
export function createIdentifier(value: string): AST.Name {
  return { kind: 'Name', range: Range(0, value.length), value }
}

/** createParameter builds a named parameter with its explicit Tao type. */
export function createParameter(name: string, type: string): AST.Parameter {
  return { kind: 'Parameter', range: Range(), name: createIdentifier(name), type: createIdentifier(type) }
}
