import * as AST from '@ast-gen'
import { Switch } from '@shared'

/** visitActionReferences visits reads, assignment targets and explicit calls in a synchronous action body. */
export function visitActionReferences(body: AST.InlineActionBody, visit: VisitName): void {
  const statements = AST.IsKind(body, 'Block') ? body.statements : [body]
  for (const statement of statements) {
    if (AST.IsKind(statement, 'SetStatement')) {
      visit(statement.target)
      AST.VisitExpressionNames(statement.value, visit)
    } else if (AST.IsKind(statement, 'DoStatement')) {
      visit(statement.target)
      for (const value of statement.arguments) {
        AST.VisitExpressionNames(value, visit)
      }
    } else {
      // Statements belonging outside actions introduce no references here.
    }
  }
}

/** visitPressReferences visits a directly bound action or an anonymous event action's references. */
export function visitPressReferences(handler: AST.PressHandler, visit: VisitName): void {
  Switch.kind(handler, {
    Name: visit,
    InlineAction: action => visitActionReferences(action.body, visit),
  })
}

type VisitName = (name: AST.Name) => void
