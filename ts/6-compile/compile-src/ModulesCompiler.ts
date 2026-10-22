import * as AST from '@ast-gen/AST'
import { Errors, S } from '@shared'
import type { LinkedDefinition, LinkedModule, LinkedProgram, ModuleBinding } from '@typecheck/Modules'
import { compileLazyBinding, compileValueReference, compileViewReference } from './BindingsCompiler'
import { emitStringLiteral } from './codegen-util'
import {
  compileForeignViews,
  type ForeignViewPathResolver,
  getForeignViewKey,
} from './ForeignViewsCompiler'
import { compileLetDefinition, isTextExpression } from './ValuesCompiler'
import { compileViewDeclaration } from './ViewsCompiler'

export type { ForeignViewPathResolver } from './ForeignViewsCompiler'

/** compileProgram emits one app module from its already linked source modules. */
export function compileProgram(
  program: LinkedProgram,
  revision: string,
  appName?: string,
  resolveForeignViewPath?: ForeignViewPathResolver,
): string {
  const selected = selectApp(program, appName)
  const resolveModuleIndex = createModuleIndexResolver(program)
  const foreign = compileForeignViews(program, resolveForeignViewPath)
  const scopes = program.modules.map((_module, index) => `const ${createScopeName(index)} = TR.Scope();`).join('\n')
  const aliases = compileAliases(program, resolveModuleIndex)
  const views = compileViews(program, buildModuleTextBindings(program), foreign.names)
  const apps = compileAppRegistrations(program)
  const definitions = compileDefinitions(program, resolveModuleIndex)
  const rootScope = createScopeName(resolveModuleIndex(selected.source))
  return S`
    import * as TR from '@runtime';
    ${foreign.imports}
    TR.ModuleApplied(${emitStringLiteral(revision)});
    ${scopes}
    ${aliases}
    ${views}
    ${apps}
    ${definitions}
    export default function App() {
      return TR.App(${compileViewReference(selected.declaration.root, rootScope)}, ${emitStringLiteral(revision)});
    }
  `
}

type ModuleIndexResolver = (path: string) => number

function createModuleIndexResolver(program: LinkedProgram): ModuleIndexResolver {
  const indexes = new Map<string, number>()
  program.modules.forEach((module, index) => indexes.set(module.path, index))
  return path =>
    indexes.get(path)
      ?? Errors.ThrowUserInput(`Linked module is missing from the program: ${path}.`)
}

function compileDefinitions(program: LinkedProgram, resolveModuleIndex: ModuleIndexResolver): string {
  return program.definitions.map(definition => compileDefinition(definition, resolveModuleIndex)).join('\n')
}

function compileDefinition(definition: LinkedDefinition, resolveModuleIndex: ModuleIndexResolver): string {
  const scope = createScopeName(resolveModuleIndex(definition.source))
  return compileLetDefinition(definition.declaration, scope)
}

function compileAliases(program: LinkedProgram, resolveModuleIndex: ModuleIndexResolver): string {
  return program.modules.flatMap((module, index) => compileModuleAliases(module, index, resolveModuleIndex)).join('\n')
}

function compileModuleAliases(
  module: LinkedModule,
  index: number,
  resolveModuleIndex: ModuleIndexResolver,
): string[] {
  const scope = createScopeName(index)
  return module.bindings.map(binding => compileAlias(binding, scope, resolveModuleIndex))
}

function compileAlias(binding: ModuleBinding, scope: string, resolveModuleIndex: ModuleIndexResolver): string {
  const targetScope = createScopeName(resolveModuleIndex(binding.source))
  const reference = compileValueReference(binding, targetScope)
  return compileLazyBinding(binding, scope, reference)
}

// Define each module app name on its scope so folder bindings resolve.
function compileAppRegistrations(program: LinkedProgram): string {
  return program.modules.flatMap(compileModuleAppRegistrations).join('\n')
}

function compileModuleAppRegistrations(module: LinkedModule, index: number): string[] {
  const scope = createScopeName(index)
  return AST.GetAppDeclarations(module.document)
    .map(app => compileModuleAppRegistration(app, scope))
}

function compileModuleAppRegistration(app: AST.AppDeclaration, scope: string): string {
  const root = compileViewReference(app.root, scope)
  return compileLazyBinding(app, scope, root)
}

function compileViews(
  program: LinkedProgram,
  inheritedByModule: ReadonlyMap<string, ReadonlySet<string>>,
  foreignNames: ReadonlyMap<string, string>,
): string {
  return program.modules.flatMap((module, index) => compileModuleViews(module, index, inheritedByModule, foreignNames))
    .join('\n')
}

function compileModuleViews(
  module: LinkedModule,
  index: number,
  inheritedByModule: ReadonlyMap<string, ReadonlySet<string>>,
  foreignNames: ReadonlyMap<string, string>,
): string[] {
  const scope = createScopeName(index)
  const inherited = inheritedByModule.get(module.path) ?? new Set()
  return AST.GetViewDeclarations(module.document)
    .map(view => compileModuleView(view, module.path, inherited, scope, foreignNames))
}

function compileModuleView(
  view: AST.ViewDeclaration,
  modulePath: string,
  inherited: ReadonlySet<string>,
  scope: string,
  foreignNames: ReadonlyMap<string, string>,
): string {
  const key = getForeignViewKey(modulePath, view.start)
  const foreignName = foreignNames.get(key)
  return compileViewDeclaration(view, inherited, scope, foreignName)
}

function buildModuleTextBindings(program: LinkedProgram): ReadonlyMap<string, ReadonlySet<string>> {
  const bindingsByModule = createBindingLookup(program)
  const textByDeclaration = new Map<string, boolean>()
  const viewModules = program.modules.filter(module => AST.HasViewDeclarations(module.document))
  const ownTextNames = createOwnTextNames(viewModules)
  for (const definition of program.definitions) {
    const isText = isTextExpression(definition.declaration.value, name => {
      const binding = bindingsByModule.get(definition.source)?.get(name.value)
      const source = binding?.source ?? definition.source
      const target = binding?.target ?? name.value
      return textByDeclaration.get(createDeclarationKey(source, target)) === true
    })
    const key = createDeclarationKey(definition.source, definition.declaration.name.value)
    textByDeclaration.set(key, isText)
    if (isText) {
      ownTextNames.get(definition.source)?.add(definition.declaration.name.value)
    }
  }
  return new Map(viewModules.map(module => [
    module.path,
    createInheritedTextNames(module, ownTextNames, textByDeclaration),
  ]))
}

function createBindingLookup(program: LinkedProgram): Map<string, Map<string, LinkedModule['bindings'][number]>> {
  return new Map(program.modules.map(module => [
    module.path,
    new Map(module.bindings.map(binding => [binding.name, binding])),
  ]))
}

function createOwnTextNames(modules: readonly LinkedModule[]): Map<string, Set<string>> {
  return new Map(modules.map(module => [module.path, new Set<string>()]))
}

function createInheritedTextNames(
  module: LinkedModule,
  ownTextNames: ReadonlyMap<string, ReadonlySet<string>>,
  textByDeclaration: ReadonlyMap<string, boolean>,
): Set<string> {
  const inherited = new Set(ownTextNames.get(module.path) ?? [])
  for (const binding of module.bindings) {
    const key = createDeclarationKey(binding.source, binding.target)
    if (textByDeclaration.get(key)) {
      inherited.add(binding.name)
    }
  }
  return inherited
}

function createDeclarationKey(source: string, name: string): string {
  // NUL separates source and declaration name, avoiding ordinary concatenation collisions.
  return `${source}\u0000${name}`
}

function selectApp(program: LinkedProgram, appName?: string): { source: string; declaration: AST.AppDeclaration } {
  const entry = program.modules.find(module => module.path === program.entry)
    ?? Errors.ThrowUserInput(`Linked entry module is missing from the program: ${program.entry}.`)
  if (appName === undefined) {
    const apps = AST.GetAppDeclarations(entry.document)
    if (apps.length !== 1) {
      Errors.ThrowUserInput('Compile one app declaration per entry file.')
    }
    return { source: entry.path, declaration: apps[0] }
  }
  const direct = AST.FindAppDeclaration(entry.document, appName)
  if (direct) {
    return { source: entry.path, declaration: direct }
  }
  const binding = entry.bindings.find(candidate => candidate.name === appName)
    ?? Errors.ThrowUserInput(`Unknown Tao app: ${appName}.`)
  const owner = program.modules.find(module => module.path === binding.source)
  const declaration = owner && AST.FindAppDeclaration(owner.document, binding.target)
  return declaration
    ? { source: binding.source, declaration }
    : Errors.ThrowUserInput(`Unknown Tao app: ${appName}.`)
}

function createScopeName(index: number): string {
  return `_scope${index}`
}
