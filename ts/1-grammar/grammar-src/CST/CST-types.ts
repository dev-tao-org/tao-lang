import type { NodeTypes } from '../../_gen_parser/CST'

/** NodeType identifies named nodes derived from the generated Tree-sitter grammar. */
export type NodeType = keyof NodeTypes

/** Field selects the generated property names owned by one CST rule. */
export type Field<Kind extends NodeType> = NodeTypes[Kind]['fields']

/** Token selects literal tokens directly owned by one CST rule. */
export type Token<Kind extends NodeType> = NodeTypes[Kind]['tokens']

/** SyntaxNode is the portable, read-only CST surface shared by native and WASM Tree-sitter. */
export interface SyntaxNode {
  readonly type: string
  readonly text: string
  readonly startIndex: number
  readonly endIndex: number
  readonly hasError: boolean
  readonly isMissing: boolean
  readonly isExtra: boolean
  readonly children: readonly SyntaxNode[]
  readonly namedChildren: readonly SyntaxNode[]
  childForFieldName(name: string): SyntaxNode | null
  childrenForFieldName(name: string): readonly SyntaxNode[]
}

/** Tree supplies an immutable CST root to source tooling without a platform parser dependency. */
export type Tree = { readonly rootNode: SyntaxNode }
