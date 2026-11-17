import * as AST from '@ast-gen'
import { Errors, NewlineCharacter, type Range, Regxs } from '@shared'

/** assertValidStatements rejects invalid declaration names and statement placements in a complete document. */
export function assertValidStatements(document: AST.Document, path: string): void {
  requireNoStatementDiagnostics(collectStatementDiagnostics(document), path)
}

/** assertValidRequirements validates discovered dependency metadata without validating unrelated declarations. */
export function assertValidRequirements(document: AST.Document, path: string): void {
  const diagnostics: StatementDiagnostic[] = []
  collectBlockDiagnostics(document.root.block, 'file', diagnostics, 'requirements')
  requireNoStatementDiagnostics(diagnostics, path)
}

/** StatementDiagnostic identifies a source error in a named declaration or statement. */
export type StatementDiagnostic = { range: Readonly<Range>; message: string }

/** collectStatementDiagnostics reports statement and declaration errors in a syntactically complete document. */
export function collectStatementDiagnostics(document: AST.Document): StatementDiagnostic[] {
  const diagnostics: StatementDiagnostic[] = []
  collectBlockDiagnostics(document.root.block, 'file', diagnostics, 'all')
  return diagnostics
}

/** requireValidDeclarationName checks an authored name at a standalone declaration consumer. */
export function requireValidDeclarationName(name: AST.Name, path: string): void {
  const diagnostic = diagnoseDeclarationName(name)
  if (diagnostic) {
    requireNoStatementDiagnostics([diagnostic], path)
  }
}

function requireNoStatementDiagnostics(diagnostics: readonly StatementDiagnostic[], path: string): void {
  if (diagnostics.length === 0) {
    return
  }
  const message = diagnostics.map(diagnostic => `${diagnostic.message} (${path}, offset ${diagnostic.range.start})`)
    .join(NewlineCharacter)
  Errors.ThrowUserInput(message, { path, diagnostics })
}

type BlockOwner = 'file' | 'app' | 'view' | 'render' | 'action' | 'library' | 'tests' | 'test' | 'expect'
type ValidationScope = 'all' | 'requirements'
type StatementKind = AST.Statement['kind']
type StatementPlacement = { syntax: string; owners: readonly BlockOwner[] }
type PlacementByStatementKind = Record<StatementKind, StatementPlacement>
type RequiredStatement = { kinds: readonly StatementKind[]; message: string; optional?: true }
type RequiredStatementByOwner = Partial<Record<BlockOwner, RequiredStatement>>

const FileOwners = ['file'] as const
const TestOwners = ['test'] as const
const ExpectOwners = ['expect'] as const
const ActionOwners = ['action'] as const
const PlacementByKind: PlacementByStatementKind = {
  ActionDeclaration: { syntax: 'Action declarations', owners: ['view'] },
  AppDeclaration: { syntax: 'App declarations', owners: FileOwners },
  DoStatement: { syntax: 'Do statements', owners: ActionOwners },
  ExpectStatement: { syntax: 'Expect statements', owners: TestOwners },
  InputExpectation: { syntax: 'Input value expectations', owners: ExpectOwners },
  LetDeclaration: { syntax: 'Let declarations', owners: ['file', 'view', 'render'] },
  PressBinding: { syntax: 'Press bindings', owners: ['render'] },
  PressStatement: { syntax: 'Press statements', owners: TestOwners },
  PublishDeclaration: { syntax: 'Publish declarations', owners: ['library'] },
  RenderInjectStatement: { syntax: 'Render statements', owners: ['view'] },
  RenderViewExpressionStatement: { syntax: 'Render statements', owners: ['view'] },
  RequiresDeclaration: { syntax: 'Requirements', owners: FileOwners },
  RootDeclaration: { syntax: 'Root declarations', owners: ['app'] },
  RunStatement: { syntax: 'Run statements', owners: TestOwners },
  SetStatement: { syntax: 'Set statements', owners: ActionOwners },
  StateDeclaration: { syntax: 'State declarations', owners: ['view'] },
  TestDeclaration: { syntax: 'Test cases', owners: ['tests'] },
  TestsDeclaration: { syntax: 'Test suites', owners: FileOwners },
  TextExpectation: { syntax: 'Text expectations', owners: ExpectOwners },
  TypeScriptLibraryDeclaration: { syntax: 'TypeScript library declarations', owners: FileOwners },
  TypeStatement: { syntax: 'Type statements', owners: TestOwners },
  UseStatement: { syntax: 'Imports', owners: FileOwners },
  ViewDeclaration: { syntax: 'View declarations', owners: ['file', 'view'] },
  ViewRenderExpression: { syntax: 'Bare view invocations', owners: ['render'] },
}

type OwnerDescriptions = Record<BlockOwner, string>
const OwnerDescription: OwnerDescriptions = {
  file: 'at file scope',
  app: 'directly inside an app',
  view: 'directly inside a view',
  render: 'inside a view invocation',
  action: 'inside an action',
  library: 'directly inside a ts-library',
  tests: 'directly inside a tests suite',
  test: 'directly inside a test case',
  expect: 'directly inside an expect block',
}

const RequiredByOwner: RequiredStatementByOwner = {
  app: { kinds: ['RootDeclaration'], message: 'An app must contain exactly one root declaration.' },
  view: {
    kinds: ['RenderInjectStatement', 'RenderViewExpressionStatement'],
    message: 'A view must contain exactly one render statement.',
  },
  library: { kinds: ['PublishDeclaration'], message: 'A ts-library must contain exactly one publish declaration.' },
  render: {
    kinds: ['PressBinding'],
    message: 'A view invocation can have only one press binding.',
    optional: true,
  },
}

type OptionalStatementBlock = AST.Block | undefined
type BlockOwningStatement = Extract<AST.Statement, { block: OptionalStatementBlock }>
type BlockOwnerByKind = Record<BlockOwningStatement['kind'], BlockOwner>
const OwnerByBlockKind: BlockOwnerByKind = {
  ActionDeclaration: 'action',
  AppDeclaration: 'app',
  ExpectStatement: 'expect',
  TestDeclaration: 'test',
  TestsDeclaration: 'tests',
  TypeScriptLibraryDeclaration: 'library',
  ViewRenderExpression: 'render',
}

function collectBlockDiagnostics(
  block: AST.Block,
  owner: BlockOwner,
  diagnostics: StatementDiagnostic[],
  scope: ValidationScope,
): void {
  const required = scope === 'all' ? RequiredByOwner[owner] : undefined
  let foundRequired = false
  for (const statement of block.statements) {
    if (scope === 'requirements' && statement.kind !== 'RequiresDeclaration') {
      collectOwnedBlockDiagnostics(statement, diagnostics, scope)
      continue
    }
    const misplaced = describeWrongOwner(statement, owner)
    if (misplaced) {
      diagnostics.push({ range: statement.range, message: misplaced })
    } else {
      const viewError = owner === 'view' ? describeViewOrder(statement, foundRequired) : undefined
      if (viewError) {
        diagnostics.push({ range: statement.range, message: viewError })
      }
      if (required?.kinds.includes(statement.kind)) {
        if (foundRequired) {
          diagnostics.push({ range: statement.range, message: required.message })
        }
        foundRequired = true
      }
    }
    collectDeclarationNameDiagnostics(statement, diagnostics)
    collectOwnedBlockDiagnostics(statement, diagnostics, scope)
  }
  if (required && !required.optional && !foundRequired) {
    diagnostics.push({ range: block.range, message: required.message })
  }
}

function collectDeclarationNameDiagnostics(statement: AST.Statement, diagnostics: StatementDiagnostic[]): void {
  if (
    AST.IsValueDeclaration(statement) || AST.IsKind(statement, [
      'TypeScriptLibraryDeclaration',
      'StateDeclaration',
      'ActionDeclaration',
    ])
  ) {
    addNameDiagnostic(statement.name, diagnostics)
  }
  if (AST.IsKind(statement, ['ViewDeclaration', 'ActionDeclaration'])) {
    for (const parameter of statement.parameters) {
      addNameDiagnostic(parameter.name, diagnostics)
    }
    return
  }
  if (AST.IsKind(statement, 'RenderInjectStatement')) {
    for (const capture of statement.injection.captures) {
      addNameDiagnostic(capture.name, diagnostics)
    }
    return
  }
  if (AST.IsKind(statement, 'RequiresDeclaration')) {
    addNameDiagnostic(statement.alias, diagnostics)
    return
  }
  if (AST.IsKind(statement, 'UseStatement')) {
    addImportNameDiagnostics(statement.imports, diagnostics)
  } else {
    // Other statements introduce no authored names of their own.
  }
}

function addImportNameDiagnostics(imports: readonly AST.NamedImport[], diagnostics: StatementDiagnostic[]): void {
  for (const imported of imports) {
    if (imported.target.value === 'all') {
      diagnostics.push({ range: imported.target.range, message: 'Imports must name individual declarations.' })
    }
    addNameDiagnostic(imported.alias, diagnostics)
  }
}

type OptionalDeclarationName = AST.Name | undefined

function addNameDiagnostic(name: OptionalDeclarationName, diagnostics: StatementDiagnostic[]): void {
  const diagnostic = name && diagnoseDeclarationName(name)
  if (diagnostic) {
    diagnostics.push(diagnostic)
  }
}

function diagnoseDeclarationName(name: AST.Name): StatementDiagnostic | undefined {
  if (Regxs.UppercaseInitialRegx.test(name.value)) {
    return undefined
  }
  return { range: name.range, message: `Declared name '${name.value}' must start with an uppercase letter.` }
}

function describeWrongOwner(statement: AST.Statement, owner: BlockOwner): string | undefined {
  if (AST.IsKind(statement, 'InputExpectation') && statement.target) {
    return 'A tagged input expectation belongs immediately after expect.'
  }
  const placement = PlacementByKind[statement.kind]
  if (placement.owners.includes(owner)) {
    return undefined
  }
  const locations = placement.owners.map(allowed => OwnerDescription[allowed]).join(' or ')
  return `${placement.syntax} belong ${locations}.`
}

function describeViewOrder(statement: AST.Statement, foundRender: boolean): string | undefined {
  if (AST.IsLetDeclaration(statement) && foundRender) {
    return 'A local let declaration must precede its view’s render statement.'
  }
  if (foundRender && AST.IsKind(statement, ['StateDeclaration', 'ActionDeclaration'])) {
    return 'A state or action declaration must precede its view’s render statement.'
  }
  if (!AST.IsViewDeclaration(statement)) {
    return undefined
  }
  if (!foundRender) {
    return 'A nested view must follow its owner’s render statement.'
  }
  if (statement.visibility !== undefined) {
    return 'A nested view is private to its owner and cannot specify visibility.'
  }
  return undefined
}

function collectOwnedBlockDiagnostics(
  statement: AST.Statement,
  diagnostics: StatementDiagnostic[],
  scope: ValidationScope,
): void {
  if (AST.IsViewDeclaration(statement)) {
    if (AST.IsKind(statement.body, 'Block')) {
      collectBlockDiagnostics(statement.body, 'view', diagnostics, scope)
    }
    return
  }
  if (AST.IsKind(statement, 'RenderViewExpressionStatement')) {
    collectOwnedBlockDiagnostics(statement.expression, diagnostics, scope)
    return
  }
  if (AST.IsKind(statement, 'PressBinding') && AST.IsKind(statement.handler, 'InlineAction')) {
    const body = statement.handler.body
    if (AST.IsKind(body, 'Block')) {
      collectBlockDiagnostics(body, 'action', diagnostics, scope)
    }
    return
  }
  if (ownsBlock(statement) && statement.block !== undefined) {
    collectBlockDiagnostics(statement.block, OwnerByBlockKind[statement.kind], diagnostics, scope)
  }
}

function ownsBlock(statement: AST.Statement): statement is BlockOwningStatement {
  return 'block' in statement
}
