import type * as AST from '@ast-gen'
import { Json } from '@shared'
import { NewlineCharacter, S } from '@shared'
import type * as Typecheck from '@typecheck'

/** NamedValue identifies a named AST declaration, parameter, capture or linked module binding. */
export type NamedValue = NamedDeclarationValue | NamedBindingValue

/** ScopeCode retains a lexical expression and optional resolved generated reference anchors. */
export type ScopeCode = string | {
  value: string
  resolveReference(name: string): string | undefined
}

/** joinCodeLines joins nonempty emitted parts with one newline. */
export function joinCodeLines(...parts: readonly OptionalCodePart[]): string {
  return joinCodeParts(parts, NewlineCharacter)
}

/** joinCodeBlocks joins nonempty emitted blocks with a blank line. */
export function joinCodeBlocks(...parts: readonly OptionalCodePart[]): string {
  return joinCodeParts(parts, NewlineCharacter + NewlineCharacter)
}

/** getScopeValue returns the lexical record expression behind a generated scope. */
export function getScopeValue(scope: ScopeCode): string {
  return typeof scope === 'string' ? scope : scope.value
}

/** emitStringLiteral escapes an external string for a generated JavaScript literal. */
export function emitStringLiteral(value: string): string {
  return Json.Print(value, { prettyPrint: false })
}

type LiteralNode = AST.Name | AST.TextLiteral | AST.RenderTag
/** emitLiteral serializes a source string as a JavaScript string literal. */
export function emitLiteral(node: LiteralNode): string {
  return emitStringLiteral(node.value)
}

/** compileName quotes the declared name of an AST node or linked module binding. */
export function compileName(node: NamedValue): string {
  return emitStringLiteral(typeof node.name === 'string' ? node.name : node.name.value)
}

type ReferencedName = AST.Name | Typecheck.ModuleBinding
/** compileReferenceName quotes the referenced name or linked binding's target. */
export function compileReferenceName(node: ReferencedName): string {
  return isModuleBinding(node) ? emitStringLiteral(node.target) : emitLiteral(node)
}

/** isModuleBinding narrows a source name or linked binding by its target field. */
export function isModuleBinding(node: ReferencedName): node is Typecheck.ModuleBinding {
  return 'target' in node
}

type NamedViewNode = Pick<ViewNameNode, 'name'>
/** compileIdentifier emits an already validated source identifier without string quoting. */
export function compileIdentifier(node: NamedViewNode): string {
  return node.name.value
}

/** listMap emits an array literal compiled from its input values. */
export function listMap<T>(values: readonly T[], compile: (value: T) => string): string {
  const items = values.map(compile)
  const inline = `[${items.join(', ')}]`
  return inline.length <= 100 && !inline.includes(NewlineCharacter) ? inline : S`
    [
      ${items.join(',\n')}
    ]
  `
}

type DeclarationNameNode = AST.ValueDeclaration | AST.Parameter | AST.Capture
type NamedDeclarationValue = Pick<DeclarationNameNode, 'name'>
type NamedBindingValue = Pick<Typecheck.ModuleBinding, 'name'>
type OptionalCodePart = string | undefined

type ViewNameNode = AST.ViewDeclaration | AST.Capture

function joinCodeParts(parts: readonly OptionalCodePart[], separator: string): string {
  return parts.filter(Boolean).join(separator)
}
