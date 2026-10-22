import { FileSystem, Path, Repo } from '@shared/os'

/** writeSemanticAst derives semantic node fields and memberships from Tree-sitter metadata. */
export async function writeSemanticAst(directory: string): Promise<void> {
  const metadataPath = Path.join(directory, 'src/node-types.json')
  const nodes = JSON.parse(await FileSystem.readFile(metadataPath, 'utf8')) as NodeMetadata[]
  const grammar = JSON.parse(
    await FileSystem.readFile(Path.join(directory, 'src/grammar.json'), 'utf8'),
  ) as GrammarMetadata
  const metadata = JSON.parse(
    await FileSystem.readFile(
      Repo.resolvePath('ts/1-grammar/grammar-src/semantic-ast-metadata.json'),
      'utf8',
    ),
  ) as SemanticMetadata
  const source = generateSemanticAst(nodes, grammar, metadata)
  const output = Repo.resolvePath('ts/2-ast-gen/_gen_AST/AST-generated.ts')
  await FileSystem.mkdir(Path.dirname(output), { recursive: true })
  await FileSystem.writeIfChanged(output, source)
}

type NodeMetadata = {
  type: string
  named: boolean
  subtypes?: { type: string }[]
  fields?: Record<string, { multiple: boolean; required: boolean; types: { type: string }[] }>
}

type GrammarMetadata = { rules: Record<string, GrammarRule> }
type GrammarRule = { type: string; value?: string; content?: GrammarRule; members?: GrammarRule[] }
type SemanticMetadata = {
  semanticNames: Record<string, string>
  semanticFieldNames: Record<string, Record<string, string>>
  requiredFields: Record<string, string[]>
  fieldTypeOverrides: Record<string, Record<string, string>>
  blocks: Record<string, { members: string[]; statementUnion?: string }>
  unions: Record<string, string[]>
}

const omittedRules = new Set([
  'All',
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

function createSemanticAstModel(nodes: NodeMetadata[], grammar: GrammarMetadata, metadata: SemanticMetadata) {
  const concreteNodes = uniqueNodes(
    nodes.filter(node =>
      node.named && !node.subtypes
      && (!omittedRules.has(node.type) || ['Identifier', 'QualifiedName'].includes(node.type))
    ),
    metadata,
  )
  const types = unique(['File', ...concreteNodes.map(node => semanticName(node.type, metadata))])
  const declarationMembers = subtypeNames(nodes, '_Declaration').map(name => semanticName(name, metadata))
  const expressionMembers = subtypeNames(nodes, '_Expression').map(name => semanticName(name, metadata))
  const renderMembers = subtypeNames(nodes, '_ViewRenderStatement').map(name => semanticName(name, metadata))
  const declarations = generateDeclarations(concreteNodes, metadata)
  const semanticKinds = unique(['Name', ...types])
  const generatedRules = JSON.stringify(semanticKinds)
  const constructorKinds = generateConstructorKinds(nodes, metadata)
  const fieldLayouts = generateFieldLayouts(nodes.filter(node => node.named && !node.subtypes), metadata)
  const semanticTypes = generateSemanticTypes(nodes, metadata)
  const constructors = generateConstructors(nodes, metadata)
  return {
    ...semanticTypes,
    blockKinds: generateBlockKinds(nodes, metadata),
    constructorKinds,
    constructors,
    declarations,
    declarationMembers: unique(declarationMembers),
    expressionMembers: unique(expressionMembers),
    fieldLayouts,
    generatedRules,
    renderMembers: unique(renderMembers),
    visibility: tokenUnion(grammar.rules.Visibility),
    providers: tokenUnion(grammar.rules.RequirementProvider),
    semanticKinds,
  }
}

function generateDeclarations(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  return [
    `export type File = Semantic<'File', { block: DeclarationBlock }>`,
    ...nodes.filter(node => semanticName(node.type, metadata) !== 'Name' && node.type !== 'Block')
      .map(node => generateNodeType(node, metadata)),
  ].join('\n\n')
}

function generateSemanticTypes(nodes: NodeMetadata[], metadata: SemanticMetadata) {
  const blockStatementUnions = Object.values(metadata.blocks).filter(block => block.statementUnion).map(block =>
    `export type ${block.statementUnion} = ${resolveMembers(block.members, nodes, metadata).join(' | ')}`
  ).join('\n')
  const blocks = Object.entries(metadata.blocks).map(([name, block]) =>
    `export type ${name} = Block<${block.statementUnion ?? resolveMembers(block.members, nodes, metadata).join(' | ')}>`
  ).join('\n')
  const unions = Object.entries(metadata.unions).map(([name, members]) =>
    `export type ${name} = ${resolveMembers(members, nodes, metadata).join(' | ')}`
  ).join('\n')
  return { blockStatementUnions, blocks, unions }
}

function generateBlockKinds(nodes: NodeMetadata[], metadata: SemanticMetadata) {
  return Object.fromEntries(
    Object.entries(metadata.blocks).map(([name, block]) => [
      name,
      resolveMembers(block.members, nodes, metadata),
    ]),
  )
}

function renderSemanticAst(model: ReturnType<typeof createSemanticAstModel>): string {
  return `// @generated from Tree-sitter node-types.json, grammar.json and semantic-ast-metadata.json.\n`
    + `import type * as CST from '@cst'\nimport { Construct } from '../ast-gen-src/AST/AST-construction'\n`
    + `export type Semantic<Kind extends string, Fields> = { readonly kind: Kind; readonly start: number; readonly end: number } & Readonly<Fields>\n`
    + `export type Visibility = ${model.visibility}\nexport type RequirementProvider = ${model.providers}\n`
    + `export type Name = Semantic<'Name', { value: string }>\n`
    + `export interface Block<Statement extends Node = Node> {\n`
    + `  readonly kind: 'Block'\n  readonly start: number\n  readonly end: number\n`
    + `  readonly statements: readonly Statement[]\n}\n`
    + `${model.declarations}\n`
    + `export type Declaration = ${model.declarationMembers.join(' | ')}\n`
    + `export type Expression = ${model.expressionMembers.join(' | ')}\n`
    + `export type ViewRenderStatement = ${model.renderMembers.join(' | ')}\n`
    + `${model.unions}\n`
    + `${model.blockStatementUnions}\n`
    + `export type ViewDeclarationImplementation = ViewDeclarationBlock | ForeignView\n`
    + `${model.blocks}\n`
    + `export type Node = ${model.semanticKinds.join(' | ')}\n`
    + `export const SemanticKinds = ${model.generatedRules} as const\n`
    + `export const CstConstructorKinds = ${model.constructorKinds} as const\n`
    + `export const CstFieldLayouts = ${model.fieldLayouts} as const\n`
    + `export const CstBlockStatementKinds = ${JSON.stringify(model.blockKinds)} as const\n`
    + `export type OfKind<Kind extends Node['kind']> = Extract<Node, { readonly kind: Kind }>\n`
    + `export function IsKind<Kind extends Node['kind']>(node: Node, kind: Kind | readonly Kind[]): node is OfKind<Kind> {\n`
    + `  return typeof kind === 'string' ? node.kind === kind : kind.some(candidate => candidate === node.kind)\n`
    + `}\n`
    + `\n${model.constructors}\n`
    + `export type Document = { readonly root: File }\n`
    + ``
}

function generateConstructorKinds(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  const kinds = nodes.filter(node => node.named && !node.subtypes)
    .filter(node => !omittedRules.has(node.type) || ['Identifier', 'QualifiedName', 'SourceFile'].includes(node.type))
    .map(node => [node.type, node.type === 'SourceFile' ? 'File' : semanticName(node.type, metadata)])
  return JSON.stringify(Object.fromEntries(kinds))
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
  return JSON.stringify(layouts)
}

function generateNodeType(node: NodeMetadata, metadata: SemanticMetadata): string {
  const kind = semanticName(node.type, metadata)
  const fields = node.fields ?? {}
  const allFields = { ...fields }
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
    const optional = field.multiple || required || override?.includes('undefined') || override?.startsWith('readonly ')
      ? ''
      : ' | undefined'
    const value = field.multiple && !override ? `readonly (${type})[]` : type
    return `  ${JSON.stringify(semanticField)}: ${value}${optional}`
  })
  if (kind === 'ImportPath' || kind === 'RenderTag' || kind === 'TextLiteral' || kind === 'ContextReference') {
    generatedFields.push('  value: string')
  }
  return `export type ${kind} = Semantic<${JSON.stringify(kind)}, {\n${unique(generatedFields).join(';\n')}\n}>`
}

function fieldType(types: { type: string }[], metadata: SemanticMetadata): string {
  const mapped = unique(types.map(type => semanticName(type.type, metadata))).map(type => {
    if (type === '_Expression') {
      return 'Expression'
    }
    if (type === '_Declaration') {
      return 'Declaration'
    }
    if (type === '_ViewRenderStatement') {
      return 'ViewRenderStatement'
    }
    if (type === 'RequirementIdentifier' || type === 'RequirementVersion') {
      return 'string'
    }
    if (type === 'RequirementProvider') {
      return 'RequirementProvider'
    }
    if (type === 'Visibility') {
      return 'Visibility'
    }
    if (type === 'Block') {
      return 'Block'
    }
    if (type === 'TypeScript') {
      return 'string'
    }
    return type
  })
  return mapped.join(' | ') || 'never'
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
  const expanded = members.flatMap(name => subtypeNames(nodes, name).length ? subtypeNames(nodes, name) : [name])
  return unique(expanded.map(name => semanticName(name, metadata)))
}

function generateConstructors(nodes: NodeMetadata[], metadata: SemanticMetadata): string {
  const constructors = uniqueNodes(
    nodes.filter(node => node.named && !node.subtypes && !omittedRules.has(node.type)),
    metadata,
  )
  const kinds = unique(['File', 'Block', 'Name', ...constructors.map(node => semanticName(node.type, metadata))])
  const entries = kinds.map(kind =>
    kind === 'Block'
      ? `export function Block(cst: CST.SyntaxNode): Block<Node> { return Construct(cst, 'Block') }`
      : `export function ${kind}(cst: CST.SyntaxNode): ${kind} { return Construct(cst, ${JSON.stringify(kind)}) }`
  )
  return entries.join('\n')
}

function subtypeNames(nodes: NodeMetadata[], name: string): string[] {
  return nodes.find(node => node.type === name)?.subtypes?.map(subtype => subtype.type) ?? []
}

function tokenUnion(rule: GrammarRule | undefined): string {
  return unique(ownedTokens(rule)).map(token => JSON.stringify(token)).join(' | ') || 'never'
}

function ownedTokens(rule: GrammarRule | undefined): string[] {
  if (!rule || rule.type === 'SYMBOL') {
    return []
  }
  if (rule.type === 'STRING') {
    return [rule.value!]
  }
  return [...ownedTokens(rule.content), ...rule.members?.flatMap(ownedTokens) ?? []]
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
