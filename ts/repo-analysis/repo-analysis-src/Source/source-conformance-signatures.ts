import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'
import { isRuntimeFunctionNode } from './source-conformance-functions'

/** complexSignatureTypeIssue reports inline structural contracts that belong in named aliases. */
export function complexSignatureTypeIssue(node: TypeScript.Node): string | undefined {
  if (!isComplexType(node) || !isInsideSignatureType(node) || hasComplexTypeAncestor(node)) {
    return undefined
  }
  return 'signature intersections, conditional/mapped types, and substantial structural records need a purpose-named type alias'
}

type OptionalSyntaxNode = TypeScript.Node | undefined

function hasComplexTypeAncestor(node: TypeScript.Node): boolean {
  let ancestor = node.parent
  while (ancestor && !TypeScript.isTypeAliasDeclaration(ancestor) && !TypeScript.isSourceFile(ancestor)) {
    if (isComplexType(ancestor)) {
      return true
    }
    ancestor = ancestor.parent
  }
  return false
}

function isComplexType(node: TypeScript.Node): boolean {
  if (
    TypeScript.isIntersectionTypeNode(node) || TypeScript.isConditionalTypeNode(node)
    || TypeScript.isMappedTypeNode(node)
  ) {
    return true
  }
  if (TypeScript.isTypeLiteralNode(node)) {
    return hasMeaningfulRecordShape(node)
  }
  return TypeScript.isUnionTypeNode(node) && node.types.some(isStructuralType)
}

function hasMeaningfulRecordShape(node: TypeScript.TypeLiteralNode): boolean {
  return node.members.length >= 3 || node.members.some(member => {
    const type = memberType(member)
    return type !== undefined && containsStructuralContract(type)
  })
}

function containsStructuralContract(node: TypeScript.TypeNode): boolean {
  if (isStructuralType(node)) {
    return true
  }
  let contains = false
  node.forEachChild(child => {
    if (TypeScript.isTypeNode(child) && containsStructuralContract(child)) {
      contains = true
    }
  })
  return contains
}

function isStructuralType(node: TypeScript.TypeNode): boolean {
  const combinesTypes = TypeScript.isIntersectionTypeNode(node) || TypeScript.isConditionalTypeNode(node)
  return combinesTypes || TypeScript.isMappedTypeNode(node) || TypeScript.isTypeLiteralNode(node)
}

function memberType(member: TypeScript.TypeElement): TypeScript.TypeNode | undefined {
  if (
    TypeScript.isPropertySignature(member) || TypeScript.isMethodSignature(member)
    || TypeScript.isIndexSignatureDeclaration(member)
  ) {
    return member.type
  }
  return undefined
}

function isInsideSignatureType(node: TypeScript.Node): boolean {
  let ancestor = node.parent
  while (ancestor) {
    if (isContractTypeOwner(ancestor, node)) {
      return true
    }
    if (TypeScript.isTypeAliasDeclaration(ancestor) || TypeScript.isSourceFile(ancestor)) {
      return false
    }
    ancestor = ancestor.parent
  }
  return false
}

function isContractTypeOwner(owner: TypeScript.Node, node: TypeScript.Node): boolean {
  if (TypeScript.isParameter(owner) || isFunctionLike(owner) || TypeScript.isPropertyDeclaration(owner)) {
    return owner.type !== undefined && containsNode(owner.type, node)
  }
  if (
    TypeScript.isPropertySignature(owner) || TypeScript.isMethodSignature(owner)
    || TypeScript.isIndexSignatureDeclaration(owner)
  ) {
    return isDeclaredContractMember(owner) && owner.type !== undefined && containsNode(owner.type, node)
  }
  return false
}

function isDeclaredContractMember(node: TypeScript.Node): boolean {
  return TypeScript.isInterfaceDeclaration(node.parent) || TypeScript.isClassLike(node.parent)
}

function isFunctionLike(node: TypeScript.Node): node is TypeScript.SignatureDeclaration {
  return isRuntimeFunctionNode(node) || TypeScript.isCallSignatureDeclaration(node)
    || TypeScript.isConstructSignatureDeclaration(node)
}

function containsNode(root: TypeScript.Node, target: TypeScript.Node): boolean {
  let ancestor: OptionalSyntaxNode = target
  while (ancestor && ancestor !== root) {
    ancestor = ancestor.parent
  }
  return ancestor === root
}
