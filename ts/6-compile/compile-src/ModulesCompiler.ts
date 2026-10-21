import * as AST from '@ast-gen/AST'
import { Errors, S } from '@shared'
import { Path } from '@shared/os'
import type { LinkedProgram } from '@typecheck/Modules'
import { compileLazyBinding, compileValueReference, compileViewReference } from './BindingsCompiler'
import { compileIdentifier, stringLiteral } from './codegen-util'
import { compileLetDefinition } from './ValuesCompiler'
import { compileViewDeclaration } from './ViewsCompiler'

/** ForeignViewPathResolver maps an authored foreign-view path relative to its owning module. */
export type ForeignViewPathResolver = (modulePath: string, authoredPath: string) => string

/** compileProgram emits one app module from its already linked source modules. */
export function compileProgram(
  program: LinkedProgram,
  revision: string,
  appName?: string,
  foreignViewPath?: ForeignViewPathResolver,
): string {
  const selected = selectApp(program, appName)
  const moduleIndexes = new Map(program.modules.map((module, index) => [module.path, index]))
  const moduleIndex: ModuleIndexResolver = path =>
    moduleIndexes.get(path)
      ?? Errors.ThrowUserInput(`Linked module is missing from the program: ${path}.`)
  const foreign = foreignViews(program, foreignViewPath)
  const scopes = program.modules.map((_module, index) => `const ${scopeName(index)} = TR.Scope();`).join('\n')
  const aliases = compileAliases(program, moduleIndex)
  const views = compileViews(program, moduleTextBindings(program), foreign.names)
  const apps = compileAppRegistrations(program)
  const definitions = compileDefinitions(program, moduleIndex)
  const rootScope = scopeName(moduleIndex(selected.source))
  return S`
    import * as TR from '@runtime';
    ${foreign.imports}
    TR.ModuleApplied(${stringLiteral(revision)});
    ${scopes}
    ${aliases}
    ${views}
    ${apps}
    ${definitions}
    export default function App() {
      return TR.App(${compileViewReference(selected.declaration.root, rootScope)}, ${stringLiteral(revision)});
    }
  `
}

type ModuleIndexResolver = (path: string) => number

function compileDefinitions(program: LinkedProgram, moduleIndex: ModuleIndexResolver): string {
  return program.definitions.map(definition =>
    compileLetDefinition(definition.declaration, scopeName(moduleIndex(definition.source)))
  ).join('\n')
}

function compileAliases(program: LinkedProgram, moduleIndex: ModuleIndexResolver): string {
  return program.modules.flatMap((module, index) =>
    module.bindings.map(binding =>
      compileLazyBinding(
        binding,
        scopeName(index),
        compileValueReference(binding, scopeName(moduleIndex(binding.source))),
      )
    )
  ).join('\n')
}

// Define each module app name on its scope so folder bindings resolve.
function compileAppRegistrations(program: LinkedProgram): string {
  return program.modules.flatMap((module, index) =>
    module.document.root.declarations
      .filter(AST.IsAppDeclaration)
      .map(app => compileLazyBinding(app, scopeName(index), compileViewReference(app.root, scopeName(index))))
  ).join('\n')
}

function compileViews(
  program: LinkedProgram,
  inheritedByModule: ReadonlyMap<string, ReadonlySet<string>>,
  foreignNames: ReadonlyMap<string, string>,
): string {
  return program.modules.flatMap((module, index) =>
    module.document.root.declarations
      .filter(AST.IsViewDeclaration)
      .map(view =>
        compileViewDeclaration(
          view,
          inheritedByModule.get(module.path) ?? new Set(),
          scopeName(index),
          foreignNames.get(foreignViewKey(module.path, view.start)),
        )
      )
  ).join('\n')
}

function foreignViews(
  program: LinkedProgram,
  resolvePath?: ForeignViewPathResolver,
): { imports: string; names: ReadonlyMap<string, string> } {
  const views = program.modules.flatMap(module =>
    module.document.root.declarations
      .filter(AST.IsViewDeclaration)
      .flatMap(view =>
        AST.IsKind(view.render, 'ForeignView')
          ? [{ module: module.path, view, authored: view.render.path.value }]
          : []
      )
  )
    .map(item => ({
      ...item,
      path: resolvePath
        ? resolvePath(item.module, item.authored)
        : Path.resolve(Path.dirname(item.module), item.authored),
    }))
    .sort((left, right) =>
      left.path.localeCompare(right.path)
      || left.module.localeCompare(right.module)
      || left.view.name.value.localeCompare(right.view.name.value)
    )
  const names = new Map<string, string>()
  const imports = views.map((item, index) => {
    const alias = `_taoForeignView${index}`
    names.set(foreignViewKey(item.module, item.view.start), alias)
    return `import { ${compileIdentifier(item.view)} as ${alias} } from ${stringLiteral(item.path)};`
  }).join('\n')
  return { imports, names }
}

function foreignViewKey(module: string, start: number): string {
  return `${module}\u0000${start}`
}

function moduleTextBindings(program: LinkedProgram): ReadonlyMap<string, ReadonlySet<string>> {
  const bindingsByModule = new Map(program.modules.map(module => [
    module.path,
    new Map(module.bindings.map(binding => [binding.name, binding])),
  ]))
  const textByDeclaration = new Map<string, boolean>()
  const viewModules = program.modules.filter(module => module.document.root.declarations.some(AST.IsViewDeclaration))
  const ownTextNames = new Map(viewModules.map(module => [module.path, new Set<string>()]))
  for (const definition of program.definitions) {
    const value = definition.declaration.value
    const binding = bindingsByModule.get(definition.source)?.get(value.value)
    const target = declarationKey(binding?.source ?? definition.source, binding?.target ?? value.value)
    const isText = AST.IsKind(value, 'TextLiteral') || textByDeclaration.get(target) === true
    textByDeclaration.set(declarationKey(definition.source, definition.declaration.name.value), isText)
    if (isText) {
      ownTextNames.get(definition.source)?.add(definition.declaration.name.value)
    }
  }
  return new Map(
    viewModules.map(module => {
      const inherited = new Set(ownTextNames.get(module.path) ?? [])
      for (const binding of module.bindings) {
        if (textByDeclaration.get(declarationKey(binding.source, binding.target))) {
          inherited.add(binding.name)
        }
      }
      return [module.path, inherited] as const
    }),
  )
}

function declarationKey(source: string, name: string): string {
  return `${source}\u0000${name}`
}

function selectApp(program: LinkedProgram, appName?: string): { source: string; declaration: AST.AppDeclaration } {
  const entry = program.modules.find(module => module.path === program.entry)
    ?? Errors.ThrowUserInput(`Linked entry module is missing from the program: ${program.entry}.`)
  if (appName === undefined) {
    const apps = entry.document.root.declarations.filter(AST.IsAppDeclaration)
    if (apps.length !== 1) {
      Errors.ThrowUserInput('Compile one app declaration per entry file.')
    }
    return { source: entry.path, declaration: apps[0] }
  }
  const direct = entry.document.root.declarations.find(
    (declaration): declaration is AST.AppDeclaration =>
      AST.IsAppDeclaration(declaration) && declaration.name.value === appName,
  )
  if (direct) {
    return { source: entry.path, declaration: direct }
  }
  const binding = entry.bindings.find(candidate => candidate.name === appName)
    ?? Errors.ThrowUserInput(`Unknown Tao app: ${appName}.`)
  const owner = program.modules.find(module => module.path === binding.source)
  const declaration = owner?.document.root.declarations.find(
    (candidate): candidate is AST.AppDeclaration =>
      AST.IsAppDeclaration(candidate) && candidate.name.value === binding.target,
  )
  return declaration
    ? { source: binding.source, declaration }
    : Errors.ThrowUserInput(`Unknown Tao app: ${appName}.`)
}

function scopeName(index: number): string {
  return `_scope${index}`
}
