import * as AST from '@ast-gen/AST'
import { Switch, Timings } from '@shared'
import { deriveNamespaceFromPath } from './Modules'

/** UsageWarning identifies an unused local binding without proposing its removal. */
export type UsageWarning = {
  severity: 'warning'
  code: 'unused-import' | 'unused-declaration'
  message: string
  start: number
  end: number
}

/** unusedWarnings checks lexical references in a complete AST without loading other modules. */
export const unusedWarnings = Timings.createTopLevelTimer(function(timings, document: AST.Document): UsageWarning[] {
  return timings.run(analyzeUsage, document)
})

type Binding = { name: AST.Name; kind: 'local' | 'import' | 'namespace'; report: boolean; used: boolean }
type Scope = { parent?: Scope; bindings: Map<string, Binding[]>; all: Binding[] }

const analyzeUsage = Timings.measured('usage.analyze', function(document: AST.Document): UsageWarning[] {
  const scope = childScope()
  for (const declaration of document.root.declarations) {
    declareModuleBinding(declaration, scope)
  }
  for (const declaration of document.root.declarations) {
    visitDeclaration(declaration, scope)
  }
  return scope.all.filter(binding => binding.report && !binding.used).map(warningFor)
    .sort((left, right) => left.start - right.start)
})

function declareModuleBinding(node: AST.Declaration, scope: Scope): void {
  if (AST.IsValueDeclaration(node)) {
    const reportUnused = AST.GetDeclarationVisibility(node) === 'file'
    declare(scope, node.name, 'local', reportUnused)
  } else if (AST.IsUseStatement(node)) {
    for (const item of node.imports) {
      declare(scope, item.alias ?? item.target, 'import')
    }
  } else if (AST.IsUsePackageStatement(node)) {
    // ex: use package @Foo as Bar -> Bar
    const value = node.alias?.value ?? deriveNamespaceFromPath(node.from.value)
    if (value) {
      const namespaceName: AST.Name = node.alias ?? { ...node.from, kind: 'Name', value }
      declare(scope, namespaceName, 'namespace')
    }
  } else {
    // Requirements and test suites do not declare module-level values.
  }
}

function visitDeclaration(node: AST.Declaration, scope: Scope): void {
  Switch.kind(node, {
    AppDeclaration: app => reference(scope, app.root),
    LetDefinition: value => visitLet(value, scope),
    ViewDeclaration: view => visitView(view, scope),
    TestsDeclaration(tests) {
      for (const test of tests.tests) {
        for (const step of test.steps) {
          if (AST.IsKind(step, 'RunStatement')) {
            reference(scope, step.app)
          }
        }
      }
    },
    UseStatement: Switch.nothing,
    UsePackageStatement: Switch.nothing,
    RequiresDeclaration: Switch.nothing,
  })
}

function visitView(node: AST.ViewDeclaration, parent: Scope): void {
  const scope = childScope(parent)
  const reportUnusedParameters = AST.GetForeignViewPath(node) === undefined
  for (const parameter of node.parameters) {
    reference(parent, parameter.type)
    declare(scope, parameter.name, 'local', reportUnusedParameters)
  }
  for (const definition of node.definitions) {
    visitLet(definition, scope)
    declare(scope, definition.name)
  }
  Switch.kind(node.render, {
    ViewRender: render => visitRender(render, scope),
    Injection(injection) {
      for (const capture of injection.captures) {
        if (AST.IsKind(capture.value, 'Name')) {
          reference(scope, capture.value)
        }
      }
    },
    ForeignView: Switch.nothing,
  })
}

function visitLet(node: AST.LetDefinition, scope: Scope): void {
  if (node.type) {
    reference(scope, node.type)
  }
  if (AST.IsKind(node.value, 'Name')) {
    reference(scope, node.value)
  }
}

function visitRender(node: AST.ViewRender, scope: Scope): void {
  reference(scope, node.target)
  for (const argument of node.arguments) {
    if (AST.IsKind(argument, 'Name')) {
      reference(scope, argument)
    }
  }
  const children = childScope(scope)
  for (const child of node.children) {
    if (AST.IsLetDefinition(child)) {
      visitLet(child, children)
      declare(children, child.name)
    } else {
      visitRender(child, children)
    }
  }
}

function childScope(parent?: Scope): Scope {
  return { parent, bindings: new Map(), all: parent?.all ?? [] }
}

function declare(scope: Scope, name: AST.Name, kind: Binding['kind'] = 'local', report = true): void {
  const binding = { name, kind, report, used: false }
  const previousBindings = scope.bindings.get(name.value) ?? []
  const bindingsForName = [...previousBindings, binding]
  scope.bindings.set(name.value, bindingsForName)
  scope.all.push(binding)
}

function reference(scope: Scope, name: AST.Name): void {
  const head = name.value.split('.')[0]!
  const namespace = scope.bindings.get(head)?.filter(binding => binding.kind === 'namespace')
  const bindings = scope.bindings.get(name.value) ?? (namespace?.length ? namespace : undefined)
  if (bindings) {
    for (const binding of bindings) {
      binding.used = true
    }
  } else if (scope.parent) {
    reference(scope.parent, name)
  } else {
    // Unresolved references are diagnosed by linking; usage analysis marks known bindings only.
  }
}

function warningFor(binding: Binding): UsageWarning {
  const code = binding.kind === 'local' ? 'unused-declaration' : 'unused-import'
  const label = binding.kind === 'local' ? 'Declaration' : 'Imported name'
  const message = `${label} '${binding.name.value}' is not used in this file.`
  return {
    severity: 'warning',
    code,
    message,
    start: binding.name.start,
    end: binding.name.end,
  }
}
