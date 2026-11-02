import * as CST from '@cst'
import * as Shared from '@shared'
import * as Generated from '../../_gen_AST/AST-generated'

export * from '../../_gen_AST/AST-generated'

/** Construct creates a semantic node from its generated Tree-sitter constructor entry. */
export function Construct<Kind extends Generated.Node['kind']>(
  cst: CST.SyntaxNode,
  kind: KindSelection<Kind>,
): Generated.OfKind<Kind> {
  const result = constructNode(cst)
  if (!Generated.IsKind(result, kind)) {
    Shared.Errors.ThrowShouldNeverHappen(`Unexpected ${result.kind} for CST ${cst.type}.`)
  }
  return result as Generated.OfKind<Kind>
}

type KindSelection<Kind> = Kind | readonly Kind[]
type GeneratedNodeField = 'kind' | 'range'
type OptionalVisibility = Generated.Visibility | undefined

type CstKind = keyof typeof Generated.CstConstructorKinds
type ChildField = { multiple: boolean; required: boolean; types: readonly string[] }
type FieldLayout = Readonly<Record<string, ChildField>>
type CustomConstructor = (cst: CST.SyntaxNode) => Generated.Node

const constructors: Partial<Record<CstKind, CustomConstructor>> = {
  SourceFile: constructFile,
  Identifier: constructName,
  QualifiedName: constructName,
  TextLiteral: constructTextLiteral,
  RenderTag: constructRenderTag,
  ContextReference: constructContextReference,
  ImportPath: constructImportPath,
  AppDeclaration: constructAppDeclaration,
  ViewDeclaration: constructViewDeclaration,
  ViewRenderExpression: constructViewRenderExpression,
  TestsDeclaration: constructTestsDeclaration,
  TestDeclaration: constructTestDeclaration,
  ExpectStatement: constructExpectStatement,
  Injection: constructInjection,
  InjectionCapture: constructCapture,
  InputValueExpectation: constructInputValueExpectation,
  UseStatement: constructUseStatement,
}

function constructNode(cst: CST.SyntaxNode): Generated.Node {
  const kind = Generated.CstConstructorKinds[cst.type as CstKind]
  if (!kind) {
    return Shared.Errors.ThrowShouldNeverHappen(`No semantic constructor exists for CST ${cst.type}.`)
  }
  const custom = constructors[cst.type as CstKind]
  if (custom) {
    return custom(cst)
  }
  return constructGeneratedNode(cst, kind)
}

function constructGeneratedNode(cst: CST.SyntaxNode, kind: Generated.Node['kind']): Generated.Node {
  const layout = Generated.CstFieldLayouts[cst.type as CstKind] as FieldLayout
  const fields = Object.fromEntries(
    Object.entries(layout).map(([name, field]) => [
      name,
      constructField(cst, kind, name, field),
    ]),
  )
  return { ...fields, range: getRange(cst), kind } as Generated.Node
}

function constructField(cst: CST.SyntaxNode, kind: Generated.Node['kind'], name: string, field: ChildField): unknown {
  if (kind === 'UseStatement' && name === 'all') {
    return cst.childForFieldName(name) !== null
  }
  const children = cst.childrenForFieldName(name)
  const constructChild = (child: CST.SyntaxNode) => isScalarField(kind, name) ? child.text : constructNode(child)
  if (field.multiple) {
    return children.map(constructChild)
  }
  const child = children[0]
  return child ? constructChild(child) : undefined
}

function isScalarField(kind: Generated.Node['kind'], name: string): boolean {
  return name === 'visibility' || kind === 'RequiresDeclaration' && ['provider', 'identifier', 'version'].includes(name)
}

function constructFile(cst: CST.SyntaxNode): Generated.File {
  const declarations = cst.namedChildren.filter(CST.IsSemanticNode).map(constructNode)
  validateBlockStatements(declarations, 'DeclarationBlock')
  const block = makeBlock(cst, declarations) as Generated.DeclarationBlock
  return makeNode(cst, 'File', { block })
}

function constructAppDeclaration(cst: CST.SyntaxNode): Generated.AppDeclaration {
  const blockNode = CST.RequiredField(cst, 'block')
  const statements = constructBlock(blockNode, 'AppDeclarationBlock').statements
  requireCount(statements, 1, 'An app block must contain exactly one root declaration.')
  const block = { range: getRange(blockNode), kind: 'Block', statements } as Generated.AppDeclarationBlock
  return makeNode(cst, 'AppDeclaration', {
    block,
    name: constructFieldNode(cst, 'name', 'Name'),
    visibility: constructOptionalVisibility(cst),
  })
}

function constructViewDeclaration(cst: CST.SyntaxNode): Generated.ViewDeclaration {
  const body = CST.RequiredField(cst, 'body')
  const parametersNode = cst.childForFieldName('parameters')
  const parameters = constructChildren(parametersNode?.namedChildren.filter(CST.IsSemanticNode) ?? [], 'Parameter')
  const implementation = body.type === 'Block' ? constructViewDeclarationBlock(body) : Construct(body, 'ForeignView')
  return makeNode(cst, 'ViewDeclaration', {
    body: implementation,
    name: constructFieldNode(cst, 'name', 'Name'),
    parameters,
    visibility: constructOptionalVisibility(cst),
  })
}

function constructViewDeclarationBlock(cst: CST.SyntaxNode): Generated.ViewDeclarationBlock {
  const statements = constructBlock(cst, 'ViewDeclarationBlock')
    .statements
  const renders = statements.filter(statement =>
    Generated.IsKind(statement, ['RenderInjectStatement', 'RenderViewExpressionStatement'])
  )
  if (renders.length !== 1) {
    Shared.Errors.ThrowUserInput('A view block must contain one render statement before its private views.')
  }
  return { range: getRange(cst), kind: 'Block', statements } as Generated.ViewDeclarationBlock
}

function constructViewRenderExpression(cst: CST.SyntaxNode): Generated.ViewRenderExpression {
  const argumentList = cst.childForFieldName('argumentList')
  const blockNode = cst.childForFieldName('block')
  const block = blockNode ? constructViewRenderBlock(blockNode) : undefined
  return makeNode(cst, 'ViewRenderExpression', {
    arguments: constructChildren(argumentList?.namedChildren.filter(CST.IsSemanticNode) ?? [], ['Name', 'TextLiteral']),
    block,
    tag: constructOptionalField(cst, 'tag', 'RenderTag'),
    target: constructFieldNode(cst, 'view', 'Name'),
  })
}

function constructViewRenderBlock(cst: CST.SyntaxNode): Generated.ViewRenderBlock {
  const statements = constructBlock(cst, 'ViewRenderBlock').statements
  return { range: getRange(cst), kind: 'Block', statements } as Generated.ViewRenderBlock
}

function constructTestsDeclaration(cst: CST.SyntaxNode): Generated.TestsDeclaration {
  const blockNode = CST.RequiredField(cst, 'block')
  const statements = constructBlock(blockNode, 'TestsBlock').statements
  return makeNode(cst, 'TestsDeclaration', {
    block: { range: getRange(blockNode), kind: 'Block', statements } as Generated.TestsBlock,
    label: constructOptionalField(cst, 'label', 'TextLiteral'),
  })
}

function constructTestDeclaration(cst: CST.SyntaxNode): Generated.TestDeclaration {
  const blockNode = CST.RequiredField(cst, 'block')
  const statements = constructBlock(blockNode, 'TestBlock')
    .statements
  return makeNode(cst, 'TestDeclaration', {
    block: { range: getRange(blockNode), kind: 'Block', statements } as Generated.TestBlock,
    label: constructOptionalField(cst, 'label', 'TextLiteral'),
  })
}

function constructExpectStatement(cst: CST.SyntaxNode): Generated.ExpectStatement {
  const blockNode = cst.childForFieldName('block')
  const expectationNode = cst.namedChildren.find(child =>
    child.type === 'TextExpectation' || child.type === 'InputExpectation'
  )
  const block = blockNode ? constructExpectationBlock(blockNode) : undefined
  return makeNode(cst, 'ExpectStatement', {
    block,
    expectation: expectationNode ? Construct(expectationNode, ['TextExpectation', 'InputExpectation']) : undefined,
    target: constructOptionalField(cst, 'target', 'RenderTag'),
  })
}

function constructExpectationBlock(cst: CST.SyntaxNode): Generated.ExpectationBlock {
  const statements = constructBlock(cst, 'ExpectationBlock').statements
  return { range: getRange(cst), kind: 'Block', statements } as Generated.ExpectationBlock
}

function constructInputValueExpectation(cst: CST.SyntaxNode): Generated.InputExpectation {
  return makeNode(cst, 'InputExpectation', {
    target: undefined,
    value: constructFieldNode(cst, 'value', 'TextLiteral'),
  })
}

function constructInjection(cst: CST.SyntaxNode): Generated.Injection {
  const captures = constructChildren(cst.namedChildren.filter(child => child.type === 'InjectionCapture'), 'Capture')
  const code = CST.TypeScriptBody(CST.RequiredField(cst, 'code')).trim()
  return makeNode(cst, 'Injection', { captures, code })
}

function constructCapture(cst: CST.SyntaxNode): Generated.Capture {
  const name = constructFieldNode(cst, 'name', 'Name')
  const value = constructOptionalField(cst, 'value', ['Name', 'ContextReference']) ?? name
  return makeNode(cst, 'Capture', { name, value })
}

function constructUseStatement(cst: CST.SyntaxNode): Generated.UseStatement {
  return makeNode(cst, 'UseStatement', {
    all: cst.childForFieldName('all') !== null,
    from: constructOptionalField(cst, 'from', 'ImportPath'),
    imports: constructFieldList(cst, 'imports', 'NamedImport'),
  })
}

function constructBlock(cst: CST.SyntaxNode, name: keyof typeof Generated.CstBlockStatementKinds): Generated.Block {
  const statements = cst.childrenForFieldName('statements').map(constructNode)
  validateBlockStatements(statements, name)
  return makeBlock(cst, statements)
}

function validateBlockStatements(
  statements: readonly Generated.Node[],
  name: keyof typeof Generated.CstBlockStatementKinds,
): void {
  const allowed: readonly string[] = Generated.CstBlockStatementKinds[name]
  const invalid = statements.find(statement => !allowed.includes(statement.kind))
  if (invalid) {
    Shared.Errors.ThrowUserInput(`Unexpected ${invalid.kind} statement in a ${getBlockName(name)} block.`)
  }
}

function getBlockName(name: keyof typeof Generated.CstBlockStatementKinds): string {
  return name.replace(Shared.Regxs.BlockTypeSuffixRegx, '')
    .replace(Shared.Regxs.LowercaseUppercaseBoundaryRegx, '$1 $2')
    .toLowerCase()
}

function makeBlock(cst: CST.SyntaxNode, statements: readonly Generated.Node[]): Generated.Block {
  return { range: getRange(cst), kind: 'Block', statements }
}

function requireCount(statements: readonly Generated.Node[], count: number, message: string): void {
  if (statements.length !== count) {
    Shared.Errors.ThrowUserInput(message)
  }
}

function constructName(cst: CST.SyntaxNode): Generated.Name {
  const parts = cst.namedChildren.filter(child => child.type === 'Identifier').map(child => child.text)
  return makeNode(cst, 'Name', { value: parts.length ? parts.join('.') : cst.text })
}

function constructTextLiteral(cst: CST.SyntaxNode): Generated.TextLiteral {
  return makeNode(cst, 'TextLiteral', { value: JSON.parse(cst.text) as string })
}

function constructRenderTag(cst: CST.SyntaxNode): Generated.RenderTag {
  return makeNode(cst, 'RenderTag', { value: cst.text.slice(1) })
}

function constructContextReference(cst: CST.SyntaxNode): Generated.ContextReference {
  return makeNode(cst, 'ContextReference', { value: cst.text.slice(2) })
}

function constructImportPath(cst: CST.SyntaxNode): Generated.ImportPath {
  return makeNode(cst, 'ImportPath', { value: cst.text })
}

function constructFieldNode<Kind extends Generated.Node['kind']>(
  cst: CST.SyntaxNode,
  field: string,
  kind: KindSelection<Kind>,
): Generated.OfKind<Kind> {
  return Construct(CST.RequiredField(cst, field), kind)
}

function constructOptionalField<Kind extends Generated.Node['kind']>(
  cst: CST.SyntaxNode,
  field: string,
  kind: KindSelection<Kind>,
): Generated.OfKind<Kind> | undefined {
  const child = cst.childForFieldName(field)
  return child ? Construct(child, kind) : undefined
}

function constructFieldList<Kind extends Generated.Node['kind']>(
  cst: CST.SyntaxNode,
  field: string,
  kind: KindSelection<Kind>,
): Generated.OfKind<Kind>[] {
  return constructChildren(cst.childrenForFieldName(field), kind)
}

function constructChildren<Kind extends Generated.Node['kind']>(
  children: readonly CST.SyntaxNode[],
  kind: KindSelection<Kind>,
): Generated.OfKind<Kind>[] {
  return children.map(child => Construct(child, kind))
}

function constructOptionalVisibility(cst: CST.SyntaxNode): Generated.Visibility | undefined {
  return cst.childForFieldName('visibility')?.text as OptionalVisibility
}

function getRange(cst: CST.SyntaxNode): Shared.Range {
  return Shared.Source.from(cst)
}

function makeNode<Kind extends Generated.Node['kind']>(
  cst: CST.SyntaxNode,
  kind: Kind,
  fields: Omit<Generated.OfKind<Kind>, GeneratedNodeField>,
): Generated.OfKind<Kind> {
  return { ...fields, kind, range: getRange(cst) } as Generated.OfKind<Kind>
}
