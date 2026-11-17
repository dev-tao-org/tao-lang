import type * as AST from '@ast-gen'

type TextArgumentValidation = {
  assertText(value: AST.Expression): void
  reject(node: AST.Node, message: string): never
}
/** assertTextFunctionArguments validates explicit roles and a unique unlabelled text argument. */
export function assertTextFunctionArguments(
  node: AST.FunctionCall,
  definition: AST.FunctionDeclaration,
  validation: TextArgumentValidation,
): void {
  const remaining = new Set(definition.parameters.map(parameter => parameter.name.value))
  let unnamedCount = 0
  for (const argument of node.arguments) {
    validation.assertText(argument.value)
    if (argument.label === undefined) {
      unnamedCount += 1
    } else if (!remaining.delete(argument.label.value)) {
      validation.reject(argument.label, `Unknown or repeated function argument role ${argument.label.value}.`)
    } else {
      // Explicit roles are removed before considering type-based matches.
    }
  }
  if (unnamedCount > 1) {
    validation.reject(node, 'Several text arguments need explicit roles; text inputs do not bind by position.')
  }
  if (unnamedCount === 1 && remaining.size > 1) {
    validation.reject(node, 'This text argument matches several roles; label the argument to choose one.')
  }
  if (remaining.size !== unnamedCount) {
    validation.reject(node, `${definition.name.value} expects ${definition.parameters.length} arguments.`)
  }
}
