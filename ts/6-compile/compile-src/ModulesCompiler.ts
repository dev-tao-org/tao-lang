import * as AST from '@ast-gen/AST'
import { Errors, S } from '@shared'
import { Platform } from '@shared/os'
import type { LinkedModule, LinkedProgram } from '@typecheck/Modules'
import { compileDeclaration, type DeclarationContext } from './DeclarationCompiler'
import { compileForeignViews, type ForeignViewPathResolver, getForeignViewKey } from './ForeignViewsCompiler'
import {
  emitAppDeclaration,
  emitModuleApplied,
  emitModuleBinding,
  emitRuntimeImports,
  emitScope,
} from './RuntimeEmitter'
import { isTextExpression } from './ValuesCompiler'

export type { ForeignViewPathResolver } from './ForeignViewsCompiler'

/** compileProgram emits one atomic app module with stable named components and linked lexical scopes. */
export function compileProgram(
  program: LinkedProgram,
  revision: string,
  appName?: string,
  resolveForeignViewPath?: ForeignViewPathResolver,
): string {
  const selected = selectApp(program, appName)
  const foreign = compileForeignViews(program, resolveForeignViewPath)
  const contexts = createModuleContexts(program, buildModuleTextBindings(program), foreign.names)
  const scopes = program.modules.map(module => emitScope(resolveContext(contexts, module.path).scope)).join('\n')
  const aliases = compileAliases(program, contexts)
  const views = compileModuleDeclarations(program, contexts, AST.GetViewDeclarations)
  const apps = compileModuleDeclarations(program, contexts, AST.GetAppDeclarations)
  const definitions = program.definitions.map(definition =>
    compileDeclaration(definition.declaration, resolveContext(contexts, definition.source))
  ).join('\n')
  const rootScope = resolveContext(contexts, selected.source).scope
  return S`
    ${emitRuntimeImports()}
    ${foreign.imports}
    ${emitModuleApplied(revision)}
    ${scopes}
    ${aliases}
    ${views}
    ${apps}
    ${definitions}
    export default function App() {
      return ${emitAppDeclaration(selected.declaration, rootScope, revision)};
    }
  `
}

type ModuleContexts = ReadonlyMap<string, DeclarationContext>
type CollectDeclarations = (document: AST.Document) => readonly AST.Declaration[]

function createModuleContexts(
  program: LinkedProgram,
  textBindings: ReadonlyMap<string, ReadonlySet<string>>,
  foreignNames: ReadonlyMap<string, string>,
): ModuleContexts {
  return new Map(program.modules.map((module, index) => [module.path, {
    scope: `_scope${index}`,
    // A new import must not rename existing component families by shifting module indexes.
    moduleIdentity: Platform.hashText(module.path).slice(0, 12),
    textBindings: textBindings.get(module.path) ?? new Set(),
    resolveForeignComponent: (view: AST.ViewDeclaration) =>
      foreignNames.get(getForeignViewKey(module.path, view.start)),
  }]))
}

function resolveContext(contexts: ModuleContexts, source: string): DeclarationContext {
  return contexts.get(source)
    ?? Errors.ThrowShouldNeverHappen(`Linked module is missing from the program: ${source}.`)
}

function compileAliases(program: LinkedProgram, contexts: ModuleContexts): string {
  return program.modules.flatMap(module => {
    const scope = resolveContext(contexts, module.path).scope
    return module.bindings.map(binding => {
      const targetScope = resolveContext(contexts, binding.source).scope
      return emitModuleBinding(binding, scope, targetScope)
    })
  }).join('\n')
}

function compileModuleDeclarations(
  program: LinkedProgram,
  contexts: ModuleContexts,
  collectDeclarations: CollectDeclarations,
): string {
  return program.modules.flatMap(module => {
    const context = resolveContext(contexts, module.path)
    return collectDeclarations(module.document).map(node => compileDeclaration(node, context))
  }).join('\n')
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
    ?? Errors.ThrowShouldNeverHappen(`Linked entry module is missing from the program: ${program.entry}.`)
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
