import { Errors, Switch, Timings } from '@shared'
import { Platform } from '@shared/os'
import type Parser from 'tree-sitter'
import type * as AST from './AST'

/** transform constructs an AST only for a syntactically valid source snapshot.
 *  Returned semantic nodes and numeric origins do not retain the caller-owned CST. */
export function transform(
  tree: Parser.Tree,
  timings = new Timings(`process:${Platform.pid}`),
): AST.Document | undefined {
  if (tree.rootNode.hasError) {
    return undefined
  }
  const transformDocument = timings.measure('transformer.transform', function transformDocument() {
    const AST = new ASTConstructor()
    const root = AST.Node(tree.rootNode, 'File')
    return { root, origins: AST.origins }
  })
  return transformDocument()
}

type OfKind<Kind extends AST.Node['kind']> = Extract<AST.Node, { kind: Kind }>

// ASTConstructor owns one snapshot; its dispatch boundary records numeric source origins.
class ASTConstructor {
  readonly origins = new Map<AST.Node, AST.Origin>()
  private readonly constructors = {
    SourceFile: this.File.bind(this),
    AppDeclaration: this.AppDeclaration.bind(this),
    ViewDeclaration: this.ViewDeclaration.bind(this),
    ViewRender: this.ViewRender.bind(this),
    Parameter: this.Parameter.bind(this),
    Injection: this.Injection.bind(this),
    InjectionCapture: this.Capture.bind(this),
    Identifier: this.Name.bind(this),
    ContextReference: this.ContextReference.bind(this),
    TextLiteral: this.TextLiteral.bind(this),
  }

  File(node: Parser.SyntaxNode): AST.File {
    return { kind: 'File', declarations: this.List(node, ['AppDeclaration', 'ViewDeclaration']) }
  }

  AppDeclaration(node: Parser.SyntaxNode): AST.AppDeclaration {
    return {
      kind: 'AppDeclaration',
      name: this.Field(node, 'name', 'Name'),
      root: this.Field(requiredChild(node, 'RootDeclaration'), 'view', 'Name'),
    }
  }

  ViewDeclaration(node: Parser.SyntaxNode): AST.ViewDeclaration {
    const parameters = node.childForFieldName('parameters')
    return {
      kind: 'ViewDeclaration',
      name: this.Field(node, 'name', 'Name'),
      parameters: parameters ? this.List(parameters, ['Parameter']) : [],
      render: this.Field(requiredChild(node, 'RenderStatement'), 'body', ['ViewRender', 'Injection']),
    }
  }

  Parameter(node: Parser.SyntaxNode): AST.Parameter {
    return { kind: 'Parameter', name: this.Field(node, 'name', 'Name'), type: this.Field(node, 'type', 'Name') }
  }

  ViewRender(node: Parser.SyntaxNode): AST.ViewRender {
    const argumentsNode = node.childForFieldName('argumentList')
    return {
      kind: 'ViewRender',
      target: this.Field(node, 'view', 'Name'),
      arguments: argumentsNode ? this.List(argumentsNode, ['Name', 'TextLiteral']) : [],
      children: node.childrenForFieldName('children').map(child => this.Node(child, 'ViewRender')),
    }
  }

  Injection(node: Parser.SyntaxNode): AST.Injection {
    return {
      kind: 'Injection',
      captures: node.namedChildren.filter(child => child.type === 'InjectionCapture').map(child =>
        this.Node(child, 'Capture')
      ),
      code: requiredField(node, 'code').text.slice(5, -3).trim(),
    }
  }

  Capture(node: Parser.SyntaxNode): AST.Capture {
    const name = this.Field(node, 'name', 'Name')
    const value = node.childForFieldName('value')
    return { kind: 'Capture', name, value: value ? this.Node(value, ['Name', 'ContextReference']) : name }
  }

  Name(node: Parser.SyntaxNode): AST.Name {
    return { kind: 'Name', value: node.text }
  }

  ContextReference(node: Parser.SyntaxNode): AST.ContextReference {
    return { kind: 'ContextReference', value: node.text.slice(2) }
  }

  TextLiteral(node: Parser.SyntaxNode): AST.TextLiteral {
    return { kind: 'TextLiteral', value: JSON.parse(node.text) as string }
  }

  Node<Kind extends AST.Node['kind']>(node: Parser.SyntaxNode, kind: Kind | readonly Kind[]): OfKind<Kind> {
    const result = Switch.on<Parser.SyntaxNode, 'type', AST.Node>(node, 'type', this.constructors)
    const allowed = typeof kind === 'string' ? [kind] : kind
    if (!allowed.includes(result.kind as Kind)) {
      Errors.ThrowUnexpected(`Unexpected ${result.kind} for CST ${node.type}.`)
    }
    this.origins.set(result, { start: node.startIndex, end: node.endIndex })
    return result as OfKind<Kind>
  }

  Field<Kind extends AST.Node['kind']>(
    node: Parser.SyntaxNode,
    field: string,
    kind: Kind | readonly Kind[],
  ): OfKind<Kind> {
    return this.Node(requiredField(node, field), kind)
  }

  List<Kind extends AST.Node['kind']>(node: Parser.SyntaxNode, kinds: readonly Kind[]): OfKind<Kind>[] {
    return node.namedChildren.map(child => this.Node(child, kinds))
  }
}

function requiredField(node: Parser.SyntaxNode, field: string): Parser.SyntaxNode {
  return node.childForFieldName(field) ?? Errors.ThrowUnexpected(`Missing CST field ${field} on ${node.type}.`)
}

function requiredChild(node: Parser.SyntaxNode, type: string): Parser.SyntaxNode {
  return node.namedChildren.find(child => child.type === type)
    ?? Errors.ThrowUnexpected(`Missing CST child ${type} on ${node.type}.`)
}
