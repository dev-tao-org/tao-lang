import * as AST from '@ast-gen/AST'
import { Switch } from '@shared'
import { literal } from './codegen-util'

/** compileExpression emits a literal or lexical scope lookup. */
export function compileExpression(node: AST.Expression, scope: string): string {
  return Switch.kind(node, {
    Name: name => `TR.Value(${scope}, ${literal(name)})`,
    TextLiteral: literal,
  })
}

/** compileLetDefinition emits one ordered immutable scope binding. */
export function compileLetDefinition(node: AST.LetDefinition, scope: string): string {
  return `TR.LetDefinition(${scope}, ${literal(node.name)}, ${compileExpression(node.value, scope)});`
}

/** textBindings identifies the implemented text expressions for native capture annotations. */
export function textBindings(
  definitions: readonly AST.LetDefinition[],
  inherited: ReadonlySet<string> = new Set(),
  parameters: readonly AST.Parameter[] = [],
): ReadonlySet<string> {
  const names = new Set(inherited)
  for (const parameter of parameters) {
    updateBinding(names, parameter.name.value, parameter.type.value === 'text')
  }
  for (const definition of definitions) {
    const isText = AST.IsKind(definition.value, 'TextLiteral') || names.has(definition.value.value)
    updateBinding(names, definition.name.value, isText)
  }
  return names
}

function updateBinding(names: Set<string>, name: string, isText: boolean): void {
  if (isText) {
    names.add(name)
  } else {
    names.delete(name)
  }
}
