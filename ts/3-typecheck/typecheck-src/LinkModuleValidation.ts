import * as AST from '@ast-gen'
import { Switch } from '@shared'
import { visitActionReferences, visitPressReferences } from './ActionReferences'

/** collectReferencedNames returns module names used by source declarations and app tests. */
export function collectReferencedNames(document: AST.Document): ReadonlySet<string> {
  const names = new Set<string>()
  for (const declaration of AST.GetDeclarations(document)) {
    Switch.kind(declaration, {
      AppDeclaration(app) {
        names.add(AST.GetAppRoot(app).value)
      },
      ViewDeclaration: view => collectViewReferences(view, names, new Set()),
      LetDeclaration: definition => addLetReferences(definition, names),
      TestsDeclaration: tests => collectTestReferences(tests, names),
      // Imports and requirements introduce bindings but do not reference Tao values.
      UseStatement: Switch.nothing,
      RequiresDeclaration: Switch.nothing,
      TypeScriptLibraryDeclaration: Switch.nothing,
      PublishDeclaration: Switch.nothing,
    })
  }
  return names
}

function collectTestReferences(tests: AST.TestsDeclaration, names: Set<string>): void {
  for (const test of AST.GetTests(tests)) {
    for (const step of AST.GetTestSteps(test)) {
      if (AST.IsKind(step, 'RunStatement')) {
        names.add(step.app.value)
      }
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
  const actions = []
  for (const statement of statements) {
    if (AST.IsKind(statement, ['ViewDeclaration', 'ActionDeclaration'])) {
      localNames.add(statement.name.value)
    }
    if (AST.IsKind(statement, 'ActionDeclaration')) {
      actions.push(statement)
    }
  }
  for (const statement of statements) {
    Switch.kind(statement, {
      LetDeclaration(definition) {
        addScopedLetReferences(definition, names, localNames)
        localNames.add(definition.name.value)
      },
      StateDeclaration(definition) {
        addScopedLetReferences(definition, names, localNames)
        localNames.add(definition.name.value)
      },
      ActionDeclaration: Switch.nothing,
      RenderViewExpressionStatement: render => addScopedRenderReferences(render.expression, names, localNames),
      RenderInjectStatement: render => addInjectionReferences(render.injection, names, localNames),
      ViewDeclaration: view => collectViewReferences(view, names, localNames),
    })
  }
  for (const action of actions) {
    const actionNames = new Set(localNames)
    for (const parameter of action.parameters) {
      addReference(parameter.type.value, names, localNames)
      actionNames.add(parameter.name.value)
    }
    visitActionReferences(action.block, name => addReference(name.value, names, actionNames))
  }
}

function addLetReferences(definition: AST.LetDeclaration, names: Set<string>): void {
  if (definition.type) {
    names.add(definition.type.value)
  }
  AST.VisitExpressionNames(definition.value, name => names.add(name.value))
}

function addScopedLetReferences(
  definition: AST.ViewValueDeclaration,
  names: Set<string>,
  localNames: ReadonlySet<string>,
): void {
  if (definition.type) {
    addReference(definition.type.value, names, localNames)
  }
  AST.VisitExpressionNames(definition.value, name => addReference(name.value, names, localNames))
}

function addScopedRenderReferences(
  render: AST.ViewRenderExpression,
  names: Set<string>,
  parentNames: ReadonlySet<string>,
): void {
  const localNames = new Set(parentNames)
  addReference(render.target.value, names, localNames)
  for (const argument of render.arguments) {
    AST.VisitExpressionNames(argument, name => addReference(name.value, names, localNames))
  }
  for (const child of AST.GetViewRenderBlockStatements(render)) {
    Switch.kind(child, {
      LetDeclaration(definition) {
        addScopedLetReferences(definition, names, localNames)
        localNames.add(definition.name.value)
      },
      PressBinding: binding =>
        visitPressReferences(binding.handler, name => addReference(name.value, names, localNames)),
      ViewRenderExpression: render => addScopedRenderReferences(render, names, localNames),
    })
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
