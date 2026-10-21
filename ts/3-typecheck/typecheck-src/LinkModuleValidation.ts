import * as AST from '@ast-gen/AST'
import { Errors } from '@shared'
import type { SourceModule } from './Modules'

/** assertUniqueLocalBindings rejects duplicate bindings in one Tao lexical scope. */
export function assertUniqueLocalBindings(source: SourceModule): void {
  for (const declaration of source.document.root.declarations.filter(AST.IsViewDeclaration)) {
    assertUniqueNames(source.path, declaration.name.value, [
      ...declaration.parameters.map(parameter => parameter.name.value),
      ...declaration.definitions.map(definition => definition.name.value),
    ])
    if (AST.IsKind(declaration.render, 'ViewRender')) {
      assertUniqueRenderChildren(source.path, declaration.name.value, declaration.render)
    }
  }
}

/** referencedNames collects module names used by source declarations and app tests. */
export function referencedNames(document: AST.Document): ReadonlySet<string> {
  const names = new Set<string>()
  for (const declaration of document.root.declarations) {
    if (AST.IsAppDeclaration(declaration)) {
      names.add(declaration.root.value)
    } else if (AST.IsViewDeclaration(declaration)) {
      const localNames = new Set(declaration.parameters.map(parameter => parameter.name.value))
      for (const parameter of declaration.parameters) {
        addReference(parameter.type.value, names, localNames)
      }
      for (const definition of declaration.definitions) {
        addScopedLetReferences(definition, names, localNames)
        localNames.add(definition.name.value)
      }
      if (AST.IsKind(declaration.render, 'ViewRender')) {
        addScopedRenderReferences(declaration.render, names, localNames)
      } else if (AST.IsKind(declaration.render, 'Injection')) {
        for (const capture of declaration.render.captures) {
          if (AST.IsKind(capture.value, 'Name')) {
            addReference(capture.value.value, names, localNames)
          }
        }
      } else {
        // Foreign views carry TypeScript code rather than Tao render references.
      }
    } else if (AST.IsLetDefinition(declaration)) {
      addLetReferences(declaration, names)
    } else if (AST.IsKind(declaration, 'TestsDeclaration')) {
      for (const test of declaration.tests) {
        for (const step of test.steps) {
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

function assertUniqueRenderChildren(source: string, view: string, render: AST.ViewRender): void {
  assertUniqueNames(
    source,
    view,
    render.children.filter(AST.IsLetDefinition).map(definition => definition.name.value),
  )
  for (const child of render.children.filter(AST.IsViewRender)) {
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

function addLetReferences(definition: AST.LetDefinition, names: Set<string>): void {
  if (definition.type) {
    names.add(definition.type.value)
  }
  if (AST.IsKind(definition.value, 'Name')) {
    names.add(definition.value.value)
  }
}

function addScopedLetReferences(
  definition: AST.LetDefinition,
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
  render: AST.ViewRender,
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
  for (const child of render.children) {
    if (AST.IsLetDefinition(child)) {
      addScopedLetReferences(child, names, localNames)
      localNames.add(child.name.value)
    } else {
      addScopedRenderReferences(child, names, localNames)
    }
  }
}

function addReference(name: string, names: Set<string>, localNames: ReadonlySet<string>): void {
  if (!localNames.has(name)) {
    names.add(name)
  }
}
