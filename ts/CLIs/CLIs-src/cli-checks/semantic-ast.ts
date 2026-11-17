import { Json } from '@shared'
import { Lists, NewlineCharacter, Objects, S, Switch } from '@shared'
import * as Shared from '@shared'
import { FS, Path, Repo } from '@shared/os'
import * as GrammarTraversal from './grammar-traversal'

/** SemanticAstOutputDirectory identifies the workspace-relative generated AST directory. */
export const SemanticAstOutputDirectory = 'ts/2-ast-gen/_gen_AST'

/** writeSemanticAst derives semantic node fields and memberships from Tree-sitter metadata.
 *  It writes ts/2-ast-gen/_gen_AST/AST-generated.ts during parser prepare; @ast-gen re-exports it
 *  as the semantic AST model for CST transform, typecheck, compile and the Tao IDE extension. */
export async function writeSemanticAst(directory: string): Promise<void> {
  const metadataPath = Path.join(directory, 'src/node-types.json')
  const nodes = await readNodeMetadata(metadataPath)
  const grammar = await readGrammarMetadata(Path.join(directory, 'src/grammar.json'))
  const metadata = await readSemanticMetadata(Repo.resolvePath('ts/1-grammar/grammar-src/semantic-ast-metadata.json'))
  const source = generateSemanticAst(nodes, grammar, metadata)
  const output = Repo.resolvePath(SemanticAstOutputDirectory, 'AST-generated.ts')
  await FS.mkdir(Path.dirname(output))
  await FS.writeIfChanged(output, source)
}

type NodeMetadata = {
  type: string
  named: boolean
  subtypes?: { type: string }[]
  fields?: Record<string, { multiple: boolean; required: boolean; types: { type: string }[] }>
}

type GrammarMetadata = { rules: Record<string, GrammarRule> }
type GrammarRule = GrammarTraversal.GrammarRule
type OptionalGrammarRule = GrammarRule | undefined
type SemanticMetadata = {
  semanticNames: SemanticNames
  semanticFieldNames: Record<string, SemanticNames>
  requiredFields: Record<string, string[]>
  fieldTypeOverrides: Record<string, SemanticFieldTypes>
  unions: Record<string, string[]>
}

type SemanticNames = Record<string, string>
type SemanticFieldTypes = Record<string, string>
type SemanticAstModel = {
  unions: string
  constructorKinds: string
  constructors: string
  declarations: string
  declarationMembers: string[]
  expressionMembers: string[]
  fieldLayouts: string
  generatedRules: string
  renderMembers: string[]
  statementMembers: string[]
  visibility: string
  providers: string
  semanticKinds: string[]
}

async function readNodeMetadata(path: string): Promise<NodeMetadata[]> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as NodeMetadata[]
}

async function readGrammarMetadata(path: string): Promise<GrammarMetadata> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as GrammarMetadata
}

async function readSemanticMetadata(path: string): Promise<SemanticMetadata> {
  return Json.Parse(await FS.readFile(path, 'utf8')) as SemanticMetadata
}

const omittedRules = new Set([
  'ArgumentList',
  'Comment',
  'Identifier',
  'ParameterList',
  'QualifiedName',
  'RequirementIdentifier',
  'RequirementProvider',
  'RequirementVersion',
  'SourceFile',
  'TypeScript',
  'Visibility',
])
function generateSemanticAst(nodes: NodeMetadata[], grammar: GrammarMetadata, metadata: SemanticMetadata): string {
  return renderSemanticAst(createSemanticAstModel(nodes, grammar, metadata))
}

function createSemanticAstModel(
  nodes: NodeMetadata[],
  grammar: GrammarMetadata,
  metadata: SemanticMetadata,
): SemanticAstModel {
  const concreteNodes = uniqueNodes(
    nodes.filter(isConcreteSemanticNode),
    metadata,
  )
  const types = Lists.unique(['File', ...concreteNodes.map(node => semanticName(node.type, metadata))])
  const declarationMembers = subtypeNames(nodes, '_Declaration').map(name => semanticName(name, metadata))
  const expressionMembers = subtypeNames(nodes, '_Expression').map(name => semanticName(name, metadata))
  const renderMembers = subtypeNames(nodes, '_ViewRenderStatement').map(name => semanticName(name, metadata))
  const statementMembers = resolveMembers(['_Statement'], nodes, metadata)
  const declarations = generateDeclarations(concreteNodes, metadata)
  const semanticKinds = Lists.unique(['Name', ...types])
  const generatedRules = emitSemanticKinds(semanticKinds)
  const constructorKinds = generateConstructorKinds(nodes, metadata)
  const fieldLayouts = generateFieldLayouts(nodes.filter(node => node.named && !node.subtypes), metadata)
  const unions = generateUnions(nodes, metadata)
  const constructors = generateConstructors(nodes, metadata)
  return {
    unions,
    statementMembers,
    constructorKinds,
    constructors,
    declarations,
    declarationMembers: Lists.unique(declarationMembers),
    expressionMembers: Lists.unique(expressionMembers),
    fieldLayouts,
    generatedRules,
    renderMembers: Lists.unique(renderMembers),
    visibility: tokenUnion(grammar.rules.Visibility),
    providers: tokenUnion(grammar.rules.RequirementProvider),
    semanticKinds,
  }
}

function isConcreteSemanticNode(node: NodeMetadata): boolean {
  if (!node.named || node.subtypes) {
    return false
  }
  return !omittedRules.has(node.type) || ['Identifier', 'QualifiedName'].includes(node.type)
}

function generateDeclarations(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  return [
    `export type File = Semantic<'File', { block: Block }>`,
    ...nodes.filter(node => semanticName(node.type, metadata) !== 'Name' && node.type !== 'Block')
      .map(node => generateNodeType(node, metadata)),
  ].join(NewlineCharacter.repeat(2))
}

function generateUnions(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  return Object.entries(metadata.unions).map(([name, members]) =>
    `export type ${name} = ${resolveMembers(members, nodes, metadata).join(' | ')}`
  ).join(NewlineCharacter)
}

function renderSemanticAst(model: SemanticAstModel): string {
  const source = S`
    // @generated from Tree-sitter node-types.json, grammar.json and semantic-ast-metadata.json.
    import type * as CST from '@cst'
    import type { Range } from '@shared'
    import { Construct } from '../ast-gen-src/AST/AST-construction'
    export type Semantic<Kind extends string, Fields> = { readonly kind: Kind; readonly range: Readonly<Range> } & Readonly<Fields>
    export type Visibility = ${model.visibility}
    export type RequirementProvider = ${model.providers}
    export type Name = Semantic<'Name', { value: string }>
    export type Block = Semantic<'Block', { statements: readonly Statement[] }>
    ${model.declarations}
    export type Declaration = ${model.declarationMembers.join(' | ')}
    export type Statement = ${model.statementMembers.join(' | ')}
    export type Expression = ${model.expressionMembers.join(' | ')}
    export type ViewRenderStatement = ${model.renderMembers.join(' | ')}
    ${model.unions}
    export type ViewDeclarationImplementation = Block | ForeignView
    export type Node = ${model.semanticKinds.join(' | ')}
    export const SemanticKinds = ${model.generatedRules} as const
    export const CstConstructorKinds = ${model.constructorKinds} as const
    export const CstFieldLayouts = ${model.fieldLayouts} as const
    export const DeclarationKinds = ${Json.Print(model.declarationMembers)} as const
    export const StatementKinds = ${Json.Print(model.statementMembers)} as const
    export type OfKind<Kind extends Node['kind']> = Extract<Node, { readonly kind: Kind }>
    export function IsKind<Kind extends Node['kind']>(node: Node, kind: Kind | readonly Kind[]): node is OfKind<Kind> {
      return typeof kind === 'string' ? node.kind === kind : kind.some(candidate => candidate === node.kind)
    }

    ${model.constructors}
    export type Document = { readonly root: File }
  `
  return Shared.joinTextLines(source, '')
}

function generateConstructorKinds(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  const kinds = nodes.filter(node => node.named && !node.subtypes)
    .filter(node => !omittedRules.has(node.type) || ['Identifier', 'QualifiedName', 'SourceFile'].includes(node.type))
    .map(node => [node.type, node.type === 'SourceFile' ? 'File' : semanticName(node.type, metadata)])
  return Json.Print(Object.fromEntries(kinds))
}

function generateFieldLayouts(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  const layouts = Object.fromEntries(
    nodes.filter(node =>
      !omittedRules.has(node.type)
      || ['Identifier', 'QualifiedName', 'SourceFile'].includes(node.type)
    ).map(node => {
      const fields = Object.entries(node.fields ?? {}).map(([name, field]) => [
        metadata.semanticFieldNames[node.type]?.[name] ?? name,
        {
          multiple: field.multiple,
          required: field.required,
          types: field.types.map(type => semanticName(type.type, metadata)),
        },
      ])
      return [node.type, Object.fromEntries(fields)]
    }),
  )
  return Json.Print(layouts)
}

function generateNodeType(node: NodeMetadata, metadata: SemanticMetadata): string {
  const kind = semanticName(node.type, metadata)
  const fields = node.fields ?? {}
  const allFields = Objects.copy(fields)
  const overrides = metadata.fieldTypeOverrides[kind] ?? {}
  for (const field of Object.keys(overrides)) {
    if (!allFields[field]) {
      allFields[field] = { multiple: false, required: false, types: [] }
    }
  }
  const generatedFields = Object.entries(allFields).map(([name, field]) => {
    const semanticField = metadata.semanticFieldNames[node.type]?.[name] ?? name
    const override = overrides[semanticField] ?? overrides[name]
    const type = override ?? fieldType(field.types, metadata)
    const required = field.required || metadata.requiredFields[kind]?.includes(semanticField)
      || metadata.requiredFields[kind]?.includes(name)
    const optional = field.multiple || required || overrideOmitsOptionality(override)
      ? ''
      : ' | undefined'
    const value = field.multiple && !override ? `readonly (${type})[]` : type
    return `  ${emitSemanticStringLiteral(semanticField)}: ${value}${optional}`
  })
  if (['ImportPath', 'RenderTag', 'TextLiteral', 'TextSegment', 'ContextReference'].includes(kind)) {
    generatedFields.push('  value: string')
  }
  return S`
    export type ${kind} = Semantic<${emitSemanticStringLiteral(kind)}, {
    ${Lists.unique(generatedFields).join(`;${NewlineCharacter}`)}
    }>
  `
}

function overrideOmitsOptionality(override?: string): boolean {
  return override?.includes('undefined') === true || override?.startsWith('readonly ') === true
}

function fieldType(types: { type: string }[], metadata: SemanticMetadata): string {
  const semanticTypes = types.map(type => semanticName(type.type, metadata))
  const mapped = Lists.unique(semanticTypes).map(mapFieldType)
  return mapped.join(' | ') || 'never'
}

function mapFieldType(type: string): string {
  return isMappedFieldType(type) ? Switch(type, fieldTypeHandlers) : type
}

function isMappedFieldType(type: string): type is keyof typeof fieldTypeHandlers {
  return Object.hasOwn(fieldTypeHandlers, type)
}

const fieldTypeHandlers = {
  _Expression: () => 'Expression',
  _Declaration: () => 'Declaration',
  _ViewRenderStatement: () => 'ViewRenderStatement',
  RequirementIdentifier: () => 'string',
  RequirementVersion: () => 'string',
  TypeScript: () => 'string',
}

function semanticName(name: string, metadata: SemanticMetadata): string {
  return metadata.semanticNames[name] ?? name
}

function uniqueNodes(nodes: NodeMetadata[], metadata?: SemanticMetadata): NodeMetadata[] {
  const seen = new Set<string>()
  return nodes.filter(node => {
    const kind = metadata ? semanticName(node.type, metadata) : node.type
    if (seen.has(kind)) {
      return false
    }
    seen.add(kind)
    return true
  })
}

function resolveMembers(members: readonly string[], nodes: NodeMetadata[], metadata: SemanticMetadata): string[] {
  return Lists.unique(members.flatMap(name => {
    const subtypes = subtypeNames(nodes, name)
    return subtypes.length > 0 ? resolveMembers(subtypes, nodes, metadata) : [semanticName(name, metadata)]
  }))
}

function generateConstructors(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  const constructors = uniqueNodes(
    nodes.filter(node => node.named && !node.subtypes && !omittedRules.has(node.type)),
    metadata,
  )
  const kinds = Lists.unique(['File', 'Block', 'Name', ...constructors.map(node => semanticName(node.type, metadata))])
  const entries = kinds.map(kind =>
    `export function ${kind}(cst: CST.SyntaxNode): ${kind} { return Construct(cst, ${
      emitSemanticStringLiteral(kind)
    }) }`
  )
  return entries.join(NewlineCharacter)
}

function subtypeNames(nodes: NodeMetadata[], name: string): string[] {
  return nodes.find(node => node.type === name)?.subtypes?.map(subtype => subtype.type) ?? []
}

function tokenUnion(rule: OptionalGrammarRule): string {
  return Lists.unique(GrammarTraversal.collectOwnedTokens(rule)).map(emitSemanticStringLiteral).join(' | ') || 'never'
}

function emitSemanticKinds(kinds: readonly string[]): string {
  return Json.Print(kinds)
}

function emitSemanticStringLiteral(value: string): string {
  return Json.Print(value)
}
