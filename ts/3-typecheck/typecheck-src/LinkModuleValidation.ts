import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import type { SourceModule } from './Modules'

/** assertUniqueLocalBindings rejects duplicate bindings in one Tao lexical scope. */
export function assertUniqueLocalBindings(source: SourceModule): void {
  for (const view of AST.GetViewDeclarations(source.document)) {
    assertUniqueViewScope(source.path, view)
  }
}

/** collectReferencedNames returns module names used by source declarations and app tests. */
export function collectReferencedNames(document: AST.Document): ReadonlySet<string> {
  const names = new Set<string>()
  for (const declaration of AST.GetDeclarations(document)) {
    if (AST.IsAppDeclaration(declaration)) {
      names.add(AST.GetAppRoot(declaration).value)
    } else if (AST.IsViewDeclaration(declaration)) {
      collectViewReferences(declaration, names, new Set())
    } else if (AST.IsLetDeclaration(declaration)) {
      addLetReferences(declaration, names)
    } else if (AST.IsKind(declaration, 'TestsDeclaration')) {
      for (const test of declaration.block.statements) {
        for (const step of AST.GetTestSteps(test)) {
          if (AST.IsKind(step, 'RunStatement')) {
            names.add(step.app.value)
          }
        }
      }
    } else {
      // Imports and requirements introduce bindings but do not reference Tao values.
    }
  }
  return names
}

function assertUniqueViewScope(source: string, view: AST.ViewDeclaration): void {
  const statements = AST.GetViewDeclarationStatements(view) ?? []
  const lets = statements.filter(AST.IsLetDeclaration)
  const children = statements.filter(AST.IsViewDeclaration)
  assertUniqueNames(source, view.name.value, [
    ...view.parameters.map(parameter => parameter.name.value),
    ...lets.map(definition => definition.name.value),
    ...children.map(child => child.name.value),
  ])
  for (const statement of statements) {
    if (AST.IsKind(statement, 'RenderViewExpressionStatement')) {
      assertUniqueRenderChildren(source, view.name.value, statement.expression)
    } else if (AST.IsViewDeclaration(statement)) {
      assertUniqueViewScope(source, statement)
    }
  }
}

function collectViewReferences(view: AST.ViewDeclaration, names: Set<string>, parentNames: ReadonlySet<string>): void {
  const statements = AST.GetViewDeclarationStatements(view) ?? []
  const localNames = new Set(parentNames)
  for (const parameter of view.parameters) {
    addReference(parameter.type.value, names, localNames)
    localNames.add(parameter.name.value)
  }
  for (const child of statements.filter(AST.IsViewDeclaration)) {
    localNames.add(child.name.value)
  }
  for (const statement of statements) {
    if (AST.IsLetDeclaration(statement)) {
      addScopedLetReferences(statement, names, localNames)
      localNames.add(statement.name.value)
    } else if (AST.IsKind(statement, 'RenderViewExpressionStatement')) {
      addScopedRenderReferences(statement.expression, names, localNames)
    } else if (AST.IsKind(statement, 'RenderInjectStatement')) {
      addInjectionReferences(statement.injection, names, localNames)
    } else if (AST.IsViewDeclaration(statement)) {
      collectViewReferences(statement, names, localNames)
    } else {
      Errors.ThrowShouldNeverHappen('Unexpected view declaration statement.')
    }
  }
}

function assertUniqueRenderChildren(source: string, view: string, render: AST.ViewRenderExpression): void {
  const statements = AST.GetViewRenderBlockStatements(render)
  const lets = statements.filter(AST.IsLetDeclaration)
  assertUniqueNames(source, view, lets.map(definition => definition.name.value))
  for (const child of statements.filter(AST.IsViewRenderExpression)) {
    assertUniqueRenderChildren(source, view, child)
  }
}

function assertUniqueNames(source: string, view: string, names: readonly string[]): void {
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) {
      Errors.ThrowUserInput(`View ${view} in ${source} declares ${name} more than once in one scope.`)
    }
    seen.add(name)
  }
}

function addLetReferences(definition: AST.LetDeclaration, names: Set<string>): void {
  if (definition.type) {
    names.add(definition.type.value)
  }
  if (AST.IsKind(definition.value, 'Name')) {
    names.add(definition.value.value)
  }
}

function addScopedLetReferences(
  definition: AST.LetDeclaration,
  names: Set<string>,
  localNames: ReadonlySet<string>,
): void {
  if (definition.type) {
    addReference(definition.type.value, names, localNames)
  }
  if (AST.IsKind(definition.value, 'Name')) {
    addReference(definition.value.value, names, localNames)
  }
}

function addScopedRenderReferences(
  render: AST.ViewRenderExpression,
  names: Set<string>,
  parentNames: ReadonlySet<string>,
): void {
  const localNames = new Set(parentNames)
  addReference(render.target.value, names, localNames)
  for (const argument of render.arguments) {
    if (AST.IsKind(argument, 'Name')) {
      addReference(argument.value, names, localNames)
    }
  }
  for (const child of AST.GetViewRenderBlockStatements(render)) {
    if (AST.IsLetDeclaration(child)) {
      addScopedLetReferences(child, names, localNames)
      localNames.add(child.name.value)
    } else {
      addScopedRenderReferences(child, names, localNames)
    }
  }
}

function addInjectionReferences(
  injection: AST.Injection,
  names: Set<string>,
  localNames: ReadonlySet<string>,
): void {
  for (const capture of injection.captures) {
    if (AST.IsKind(capture.value, 'Name')) {
      addReference(capture.value.value, names, localNames)
    }
  }
}

function addReference(name: string, names: Set<string>, localNames: ReadonlySet<string>): void {
  if (!localNames.has(name)) {
    names.add(name)
  }
}
