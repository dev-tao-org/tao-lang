import { Source } from '@shared'
import { TypeScript } from '@tao/shared/typescript'
import * as SourceConformanceApi from './source-conformance-api'

type OptionalApiName = string | undefined

/** ExportedApiChecker checks documentation and shapes for exported APIs. */
export class ExportedApiChecker {
  /** publicNamespaces tracks namespaces whose members form part of the public API. */
  readonly publicNamespaces = new Set<TypeScript.Node>()

  /** ExportedApiChecker initializes the diagnostics and public documentation state. */
  constructor(
    private readonly source: string,
    private readonly file: TypeScript.SourceFile,
    private readonly publicDocs: Set<number>,
    private readonly report: (position: number, message: string) => void,
  ) {}

  /** checkScope validates API docs within one source or namespace scope. */
  checkScope(scope: ApiScope, implicitExports = false): void {
    const groups = new Map<string, SourceConformanceApi.ApiGroup>()
    const anonymous: SourceConformanceApi.ApiGroup[] = []
    this.collectScopeDeclarations(scope, implicitExports, groups, anonymous)
    this.collectScopeExports(scope, groups, anonymous)
    this.checkExportedGroups(groups, anonymous)
  }

  private collectScopeDeclarations(
    scope: ApiScope,
    implicitExports: boolean,
    groups: Map<string, SourceConformanceApi.ApiGroup>,
    anonymous: SourceConformanceApi.ApiGroup[],
  ): void {
    for (const statement of scope.statements) {
      if (TypeScript.isVariableStatement(statement)) {
        this.addVariableDeclarations(statement, implicitExports, groups, anonymous)
      } else if (SourceConformanceApi.isApiDeclaration(statement)) {
        this.addApiGroup(
          statement.name?.text,
          [statement],
          implicitExports || SourceConformanceApi.isExported(statement),
          groups,
          anonymous,
        )
      } else {
        // Imports, forwarding exports and executable statements do not define local API groups.
      }
    }
  }

  private addVariableDeclarations(
    statement: TypeScript.VariableStatement,
    implicitExports: boolean,
    groups: Map<string, SourceConformanceApi.ApiGroup>,
    anonymous: SourceConformanceApi.ApiGroup[],
  ): void {
    for (const declaration of statement.declarationList.declarations) {
      for (const name of SourceConformanceApi.collectBindingNames(declaration.name)) {
        this.addApiGroup(
          name.text,
          [name, declaration, statement],
          implicitExports || SourceConformanceApi.isExported(statement),
          groups,
          anonymous,
        )
      }
    }
  }

  private addApiGroup(
    name: OptionalApiName,
    nodes: TypeScript.Node[],
    exported: boolean,
    groups: Map<string, SourceConformanceApi.ApiGroup>,
    anonymous: SourceConformanceApi.ApiGroup[],
  ): void {
    if (name === undefined) {
      if (exported) {
        anonymous.push({ nodes, exported })
      }
      return
    }
    const group = groups.get(name) ?? { name, nodes: [], exported: false }
    group.nodes.push(...nodes)
    group.exported ||= exported
    groups.set(name, group)
  }

  private collectScopeExports(
    scope: ApiScope,
    groups: Map<string, SourceConformanceApi.ApiGroup>,
    anonymous: SourceConformanceApi.ApiGroup[],
  ): void {
    for (const statement of scope.statements) {
      if (TypeScript.isExportDeclaration(statement)) {
        this.collectForwardingExport(statement, groups)
      } else if (TypeScript.isExportAssignment(statement)) {
        this.collectDefaultExport(statement, groups, anonymous)
      } else {
        // Declaration exports were collected earlier; other statements add no forwarding exports.
      }
    }
  }

  private collectForwardingExport(
    statement: TypeScript.ExportDeclaration,
    groups: Map<string, SourceConformanceApi.ApiGroup>,
  ): void {
    // Forwarding exports may be documented but do not duplicate the declaration's docs.
    this.allowDocs([statement])
    if (SourceConformanceApi.isLocalNamedExport(statement)) {
      for (const specifier of statement.exportClause.elements) {
        const group = groups.get(specifier.propertyName?.text ?? specifier.name.text)
        if (group) {
          group.exported = true
        }
      }
    }
  }

  private collectDefaultExport(
    statement: TypeScript.ExportAssignment,
    groups: Map<string, SourceConformanceApi.ApiGroup>,
    anonymous: SourceConformanceApi.ApiGroup[],
  ): void {
    const group = TypeScript.isIdentifier(statement.expression) ? groups.get(statement.expression.text) : undefined
    if (group) {
      group.exported = true
      group.nodes.push(statement)
    } else {
      anonymous.push({ nodes: [statement], exported: true })
    }
  }

  private checkExportedGroups(
    groups: Map<string, SourceConformanceApi.ApiGroup>,
    anonymous: SourceConformanceApi.ApiGroup[],
  ): void {
    for (const group of [...groups.values(), ...anonymous]) {
      if (group.exported) {
        this.checkExportedGroup(group)
      }
    }
  }

  private checkExportedGroup(group: SourceConformanceApi.ApiGroup): void {
    this.checkDocs(group)
    for (const node of group.nodes) {
      if (TypeScript.isModuleDeclaration(node)) {
        this.allowPublicNamespace(node)
      } else {
        this.allowShapeDocs(node)
      }
    }
  }

  private allowPublicNamespace(node: TypeScript.ModuleDeclaration): void {
    let namespace = node
    while (true) {
      this.publicNamespaces.add(namespace)
      if (!namespace.body || !TypeScript.isModuleDeclaration(namespace.body)) {
        break
      }
      namespace = namespace.body
    }
  }

  private checkDocs(group: SourceConformanceApi.ApiGroup): void {
    const valid = this.allowDocs(group.nodes).some(range =>
      SourceConformanceApi.hasDescription(
        SourceConformanceApi.normalizeDoc(Source.slice(this.source, range.pos + 3, range.end - 2)),
        group.name,
      )
    )
    if (!valid) {
      this.report(
        group.nodes[0].getStart(this.file),
        'exported API ' + (group.name ?? '<default>')
          + ' needs JSDoc beginning with its name and a description',
      )
    }
  }

  private allowShapeDocs(node: TypeScript.Node): void {
    if (SourceConformanceApi.isPrivateApiMember(node) || SourceConformanceApi.isImplementationNode(node)) {
      return
    }
    this.allowDocs([node])
    this.allowInlineMemberDocs(node)
    TypeScript.forEachChild(node, child => this.allowShapeDocs(child))
  }

  private allowInlineMemberDocs(node: TypeScript.Node): void {
    if (!SourceConformanceApi.isApiMember(node)) {
      return
    }
    // Inline member docs are trailing trivia after the preceding brace or separator.
    for (const range of TypeScript.getTrailingCommentRanges(this.source, node.getFullStart()) ?? []) {
      if (range.end <= node.getStart(this.file) && this.source.startsWith('/**', range.pos)) {
        this.publicDocs.add(range.pos)
      }
    }
  }

  private allowDocs(nodes: readonly TypeScript.Node[]): TypeScript.CommentRange[] {
    const ranges = SourceConformanceApi.docs(this.source, nodes)
    for (const range of ranges) {
      this.publicDocs.add(range.pos)
    }
    return ranges
  }
}

type ApiScope = TypeScript.SourceFile | TypeScript.ModuleBlock
