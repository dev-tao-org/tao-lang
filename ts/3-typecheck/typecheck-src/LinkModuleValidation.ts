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
      for (const parameter of declaration.parameters) {
        names.add(parameter.type.value)
      }
      for (const definition of declaration.definitions) {
        addLetReferences(definition, names)
      }
      if (AST.IsKind(declaration.render, 'ViewRender')) {
        addRenderReferences(declaration.render, names)
      } else if (AST.IsKind(declaration.render, 'Injection')) {
        for (const capture of declaration.render.captures) {
          if (AST.IsKind(capture.value, 'Name')) {
            names.add(capture.value.value)
          }
        }
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

function addRenderReferences(render: AST.ViewRender, names: Set<string>): void {
  names.add(render.target.value)
  for (const argument of render.arguments) {
    if (AST.IsKind(argument, 'Name')) {
      names.add(argument.value)
    }
  }
  for (const child of render.children) {
    if (AST.IsLetDefinition(child)) {
      addLetReferences(child, names)
    } else {
      addRenderReferences(child, names)
    }
  }
}
