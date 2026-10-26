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
  for (const declaration of AST.GetDeclarations(document)) {
    declareModuleBinding(declaration, scope)
  }
  for (const declaration of AST.GetDeclarations(document)) {
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
    AppDeclaration: app => reference(scope, AST.GetAppRoot(app)),
    LetDeclaration: value => visitLet(value, scope),
    ViewDeclaration: view => visitView(view, scope),
    TestsDeclaration(tests) {
      for (const test of tests.block.statements) {
        for (const step of AST.GetTestSteps(test)) {
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
  const statements = AST.GetViewDeclarationStatements(node)
  if (statements) {
    for (const child of statements.filter(AST.IsViewDeclaration)) {
      declare(scope, child.name)
    }
    for (const statement of statements) {
      if (AST.IsLetDeclaration(statement)) {
        visitLet(statement, scope)
        declare(scope, statement.name)
      } else if (AST.IsKind(statement, 'RenderViewExpressionStatement')) {
        visitRender(statement.expression, scope)
      } else if (AST.IsKind(statement, 'RenderInjectStatement')) {
        visitInjection(statement.injection, scope)
      } else if (AST.IsViewDeclaration(statement)) {
        visitView(statement, scope)
      } else {
        // The view block grammar and semantic constructor constrain its statements.
      }
    }
  }
}

function visitLet(node: AST.LetDeclaration, scope: Scope): void {
  if (node.type) {
    reference(scope, node.type)
  }
  if (AST.IsKind(node.value, 'Name')) {
    reference(scope, node.value)
  }
}

function visitRender(node: AST.ViewRenderExpression, scope: Scope): void {
  reference(scope, node.target)
  for (const argument of node.arguments) {
    if (AST.IsKind(argument, 'Name')) {
      reference(scope, argument)
    }
  }
  const statements = AST.GetViewRenderBlockStatements(node)
  if (statements.length > 0) {
    const childrenScope = childScope(scope)
    for (const child of statements) {
      if (AST.IsLetDeclaration(child)) {
        visitLet(child, childrenScope)
        declare(childrenScope, child.name)
      } else {
        visitRender(child, childrenScope)
      }
    }
  }
}

function visitInjection(node: AST.Injection, scope: Scope): void {
  for (const capture of node.captures) {
    if (AST.IsKind(capture.value, 'Name')) {
      reference(scope, capture.value)
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
