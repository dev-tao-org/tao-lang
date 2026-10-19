import * as AST from '@ast-gen/AST'
import { Tests } from '@shared/os'
import { linkModules } from '../typecheck-src/LinkModules'
import type { SourceModule } from '../typecheck-src/Modules'

Tests.test('named aliases, public wildcards and folder siblings become local bindings', () => {
  const entry = source('app/main.tao', [useNamed('Open', 'Renamed'), useAll()], ['app/views.tao'])
  const imported = source('app/views.tao', [
    letDefinition('Open', 'shown', 'public'),
    letDefinition('Hidden', 'hidden'),
    view('Sibling', 'folder'),
  ])
  const wildcardSource = source('app/wildcards.tao', [letDefinition('OpenAll', 'shown', 'public')])
  entry.imports = [
    resolved(useNamed('Open', 'Renamed'), 'app/views.tao', 'same-directory'),
    resolved(useAll(), 'app/wildcards.tao', 'same-directory'),
  ]
  const linked = linkModules(entry.path, [entry, imported, wildcardSource])
  Tests.expect(linked.modules[0]?.bindings).toEqual([
    { name: 'Renamed', source: 'app/views.tao', target: 'Open' },
    { name: 'OpenAll', source: 'app/wildcards.tao', target: 'OpenAll' },
    { name: 'Sibling', source: 'app/views.tao', target: 'Sibling' },
  ])
})

Tests.test('an explicit import takes precedence over an implicit sibling with the same name', () => {
  const statement = useNamed('Item')
  const entry = source('app/main.tao', [statement], ['app/sibling.tao'])
  const sibling = source('app/sibling.tao', [view('Item', 'folder')])
  const imported = source('app/explicit.tao', [view('Item', 'public')])
  entry.imports = [resolved(statement, imported.path, 'same-project')]
  const linked = linkModules(entry.path, [entry, sibling, imported])
  Tests.expect(linked.modules[0]?.bindings).toEqual([
    { name: 'Item', source: imported.path, target: 'Item' },
  ])
})

Tests.test('package imports bind visible exports under explicit or derived namespaces', () => {
  const statement = usePackage('libs/widgets', 'UI')
  const derived = usePackage('@scope/catalog')
  const entry = source('app/main.tao', [statement, derived])
  const pkg = source('libs/widgets/index.tao', [
    letDefinition('Card', 'card', 'public'),
    view('InternalCard', 'project'),
  ])
  const catalog = source('libs/catalog/main.tao', [view('Item', 'public')])
  entry.imports = [
    resolved(statement, pkg.path, 'same-package'),
    resolved(derived, catalog.path, 'same-project'),
  ]
  Tests.expect(linkModules(entry.path, [entry, pkg, catalog]).modules[0]?.bindings).toEqual([
    { name: 'UI.Card', source: pkg.path, target: 'Card' },
    { name: 'UI.InternalCard', source: pkg.path, target: 'InternalCard' },
    { name: 'catalog.Item', source: catalog.path, target: 'Item' },
  ])
})

Tests.test('named imports report missing and invisible declarations', () => {
  const statement = useNamed('Secret')
  const entry = source('app/main.tao', [statement])
  const target = source('app/private.tao', [letDefinition('Secret', 'hidden')])
  entry.imports = [resolved(statement, target.path, 'same-directory')]
  Tests.expect(() => linkModules(entry.path, [entry, target])).toThrow(
    'Cannot import Secret from app/main.tao: it is not visible',
  )
})

Tests.test('duplicate local declarations, repeated imports and import collisions fail', () => {
  const duplicate = source('app/duplicate.tao', [letDefinition('Value', 'one'), letDefinition('Value', 'two')])
  Tests.expect(() => linkModules(duplicate.path, [duplicate])).toThrow('declares Value more than once')

  const statement = useNamed('Value')
  const entry = source('app/main.tao', [statement, statement])
  const target = source('app/values.tao', [letDefinition('Value', 'value', 'public')])
  entry.imports = [
    resolved(statement, target.path, 'same-directory'),
    resolved(statement, target.path, 'same-directory'),
  ]
  Tests.expect(() => linkModules(entry.path, [entry, target])).toThrow('repeats an import statement')

  const collision = source('app/main.tao', [statement, letDefinition('Value', 'own')])
  collision.imports = [resolved(statement, target.path, 'same-directory')]
  Tests.expect(() => linkModules(collision.path, [collision, target])).toThrow('which it also declares')

  const packageUse = usePackage('libs/ui', 'UI')
  const namespaceCollision = source('app/main.tao', [packageUse, letDefinition('UI', 'value')])
  namespaceCollision.imports = [resolved(packageUse, 'libs/ui/index.tao', 'same-package')]
  const packageExports = source('libs/ui/index.tao', [view('Text', 'public')])
  Tests.expect(() => linkModules(namespaceCollision.path, [namespaceCollision, packageExports]))
    .toThrow('value and namespace both named UI')
})

Tests.test('duplicate view bindings fail in their own scope while child scopes may shadow', () => {
  const duplicate: AST.ViewDeclaration = {
    ...view('Main', 'file'),
    definitions: [letDefinition('Title', 'one'), letDefinition('Title', 'two')],
  }
  Tests.expect(() => linkModules('app/main.tao', [source('app/main.tao', [duplicate])]))
    .toThrow('View Main in app/main.tao declares Title more than once in one scope')

  const root: AST.ViewDeclaration = {
    ...view('Main', 'file'),
    definitions: [letDefinition('Title', 'outer')],
    render: viewRender('Col', [
      letDefinition('Title', 'inner'),
      viewRender('Row', [letDefinition('Title', 'nested')]),
    ]),
  }
  Tests.expect(() => linkModules('app/main.tao', [source('app/main.tao', [root])])).not.toThrow()
})

Tests.test('ambiguous sibling names fail only when the module references them', () => {
  const unreferenced = view('Main', 'file')
  const left = source('app/left.tao', [view('Item', 'folder')])
  const right = source('app/right.tao', [view('Item', 'folder')])
  const entry = source('app/main.tao', [unreferenced], [left.path, right.path])

  Tests.expect(linkModules(entry.path, [entry, left, right]).modules[0]?.bindings).toEqual([])
  const referenced = source('app/main.tao', [{ ...unreferenced, render: viewRender('Item') }], [left.path, right.path])
  Tests.expect(() => linkModules(referenced.path, [referenced, left, right])).toThrow('ambiguous sibling name Item')

  const parameterView: AST.ViewDeclaration = {
    ...unreferenced,
    parameters: [{ kind: 'Parameter', start: 0, end: 0, name: identifier('Item'), type: identifier('text') }],
    render: renderWithNameArgument('Text', 'Item'),
  }
  const parameterSource = source('app/main.tao', [parameterView], [left.path, right.path])
  Tests.expect(() => linkModules(parameterSource.path, [parameterSource, left, right])).not.toThrow()

  const localLetView: AST.ViewDeclaration = {
    ...unreferenced,
    render: viewRender('Col', [letDefinition('Item', 'local'), renderWithNameArgument('Text', 'Item')]),
  }
  const localLetSource = source('app/main.tao', [localLetView], [left.path, right.path])
  Tests.expect(() => linkModules(localLetSource.path, [localLetSource, left, right])).not.toThrow()
})

Tests.test('cross-module lets are ordered by dependency and cycles are reported', () => {
  const importBase = useNamed('Base')
  const entry = source('app/main.tao', [importBase, letReference('Result', 'Base')])
  const base = source('app/base.tao', [letDefinition('Base', 'ready', 'public')])
  entry.imports = [resolved(importBase, base.path, 'same-project')]
  const linked = linkModules(entry.path, [entry, base])
  Tests.expect(linked.definitions.map(item => `${item.source}:${item.declaration.name.value}`))
    .toEqual(['app/base.tao:Base', 'app/main.tao:Result'])

  const importA = useNamed('A')
  const importB = useNamed('B')
  const a = source('app/a.tao', [importB, letReference('A', 'B', 'public')])
  const b = source('app/b.tao', [importA, letReference('B', 'A', 'public')])
  a.imports = [resolved(importB, b.path, 'same-project')]
  b.imports = [resolved(importA, a.path, 'same-project')]
  Tests.expect(() => linkModules(a.path, [a, b])).toThrow('Module-level let cycle')
})

Tests.test('unknown module-level let references fail with their owning source', () => {
  const module = source('app/main.tao', [letReference('Result', 'Missing')])
  Tests.expect(() => linkModules(module.path, [module])).toThrow('Unknown let reference Missing in app/main.tao')
  const statement = useNamed('Base')
  const qualified = source('app/main.tao', [statement, letReference('Result', 'Base.Missing')])
  const imported = source('app/base.tao', [letDefinition('Base', 'ready', 'public')])
  qualified.imports = [resolved(statement, imported.path, 'same-project')]
  Tests.expect(() => linkModules(qualified.path, [qualified, imported]))
    .toThrow('Unknown let reference Base.Missing in app/main.tao')
})

function source(
  path: string,
  declarations: readonly AST.Declaration[],
  siblings: readonly string[] = [],
): SourceModule {
  return {
    path,
    document: { root: { kind: 'File', start: 0, end: 0, declarations } },
    imports: [],
    siblings,
  }
}

function letDefinition(name: string, value: string, visibility?: AST.Visibility): AST.LetDefinition {
  return {
    kind: 'LetDefinition',
    start: 0,
    end: 0,
    name: identifier(name),
    value: { kind: 'TextLiteral', start: 0, end: 0, value },
    ...(visibility ? { visibility } : {}),
  }
}

function letReference(name: string, value: string, visibility?: AST.Visibility): AST.LetDefinition {
  return {
    kind: 'LetDefinition',
    start: 0,
    end: 0,
    name: identifier(name),
    value: identifier(value),
    ...(visibility ? { visibility } : {}),
  }
}

function view(name: string, visibility: AST.Visibility): AST.ViewDeclaration {
  return {
    kind: 'ViewDeclaration',
    start: 0,
    end: 0,
    name: identifier(name),
    visibility,
    parameters: [],
    definitions: [],
    render: { kind: 'Injection', start: 0, end: 0, captures: [], code: '' },
  }
}

function viewRender(target: string, children: AST.ViewRender['children'] = []): AST.ViewRender {
  return {
    kind: 'ViewRender',
    start: 0,
    end: 0,
    target: identifier(target),
    arguments: [],
    children,
  }
}

function renderWithNameArgument(target: string, name: string): AST.ViewRender {
  return { ...viewRender(target), arguments: [identifier(name)] }
}

function useNamed(target: string, alias?: string): AST.UseStatement {
  return {
    kind: 'UseStatement',
    start: 0,
    end: 0,
    all: false,
    imports: [{
      kind: 'NamedImport',
      start: 0,
      end: 0,
      target: identifier(target),
      ...(alias ? { alias: identifier(alias) } : {}),
    }],
  }
}

function useAll(): AST.UseStatement {
  return { kind: 'UseStatement', start: 0, end: 0, all: true, imports: [] }
}

function usePackage(path: string, alias?: string): AST.UsePackageStatement {
  return {
    kind: 'UsePackageStatement',
    start: 0,
    end: 0,
    from: { kind: 'ImportPath', start: 0, end: 0, value: path },
    ...(alias ? { alias: identifier(alias) } : {}),
  }
}

function resolved(
  statement: AST.UseStatement | AST.UsePackageStatement,
  path: string,
  relation: 'same-file' | 'same-directory' | 'same-package' | 'same-project' | 'public',
): SourceModule['imports'][number] {
  return { statement, targets: [{ path, relation }] }
}

function identifier(value: string): AST.Name {
  return { kind: 'Name', start: 0, end: value.length, value }
}
