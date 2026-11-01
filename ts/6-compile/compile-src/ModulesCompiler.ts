import * as AST from '@ast-gen/AST'
import { Errors, joinTextLines, S } from '@shared'
import { Platform } from '@shared/os'
import { createModuleMemberKey, type LinkedModule, type LinkedProgram } from '@typecheck/Modules'
import { emitStringLiteral, joinCodeBlocks, joinCodeLines } from './codegen-util'
import * as DeclarationCompiler from './DeclarationCompiler'
import { compileForeignViews, type ForeignViewPathResolver } from './ForeignViewsCompiler'
import { compileModuleImport, createGeneratedPaths, resolveViewsPath } from './GeneratedPaths'
import { buildModuleTextBindings } from './ModuleTextBindings'
import * as RuntimeEmitter from './RuntimeEmitter'

export type { ForeignViewPathResolver } from './ForeignViewsCompiler'

/** CompiledFiles maps generated relative module paths to their emitted TypeScript source. */
export type CompiledFiles = Readonly<MutableCompiledFiles>

/** compileProgram emits source-owned modules and one ordered, revision-bearing bootstrap.
 *  Components receive lexical records through props; binding-type imports erase at runtime. */
export function compileProgram(
  program: LinkedProgram,
  revision: string,
  appName?: string,
  resolveForeignViewPath?: ForeignViewPathResolver,
): CompiledFiles {
  const selected = selectApp(program, appName)
  const paths = createGeneratedPaths(program)
  const textBindings = buildModuleTextBindings(program)
  const files: MutableCompiledFiles = {}
  for (const module of program.modules) {
    const path = resolvePath(paths, module.path)
    const generated = compileSource(module, program, paths, textBindings, resolveForeignViewPath)
    files[path] = generated.main
    if (generated.views) {
      files[resolveViewsPath(path)] = generated.views
    }
  }
  files['App.tsx'] = compileBootstrap(program, paths, selected, revision)
  return files
}

type GeneratedSource = { main: string; views: string }
type MutableCompiledFiles = Record<string, string>
type GeneratedPaths = ReadonlyMap<string, string>
type SelectedApp = { source: string; declaration: AST.AppDeclaration }
type CompiledDeclaration = { node: AST.Declaration; compiled: DeclarationCompiler.DeclarationCompilation }

function compileSource(
  module: LinkedModule,
  program: LinkedProgram,
  paths: GeneratedPaths,
  textBindings: ReadonlyMap<string, ReadonlySet<string>>,
  resolveForeignViewPath?: ForeignViewPathResolver,
): GeneratedSource {
  const sourceProgram = selectSourceProgram(program, module)
  const foreign = compileForeignViews(sourceProgram, resolveForeignViewPath)
  const context = createModuleCompilationContext(module, textBindings, foreign.names)
  const declarations = AST.GetDeclarations(module.document).map(node => ({
    node,
    compiled: DeclarationCompiler.compileDeclaration(node, context),
  }))
  const components = joinCodeBlocks(...declarations.map(item => item.compiled.components))
  const mainPath = resolvePath(paths, module.path)
  const viewPath = resolveViewsPath(mainPath)
  const main = compileMain(module, paths, context, declarations, components.length > 0, foreign.imports)
  const views = components
    ? S`
      ${RuntimeEmitter.emitRuntimeImports()}
      import type { Scope as ModuleScope, Imports as ModuleImports } from ${compileModuleImport(viewPath, mainPath)};
      ${foreign.imports}

      ${components}
    `
    : ''
  return { main, views }
}

function selectSourceProgram(program: LinkedProgram, module: LinkedModule): LinkedProgram {
  return { ...program, modules: [module] }
}

function createModuleCompilationContext(
  module: LinkedModule,
  textBindings: ReadonlyMap<string, ReadonlySet<string>>,
  foreignNames: ReadonlyMap<string, string>,
): DeclarationCompiler.DeclarationContext {
  return {
    scope: '_Scope',
    scopeType: 'ModuleScope',
    componentPrefix: '_Views.',
    moduleIdentity: Platform.hashText(module.path).slice(0, 12),
    textBindings: textBindings.get(module.path) ?? new Set(),
    moduleBindings: module.bindings,
    resolveForeignComponent: node => foreignNames.get(createModuleMemberKey(module.path, node.start)),
  }
}

function compileMain(
  module: LinkedModule,
  paths: GeneratedPaths,
  context: DeclarationCompiler.DeclarationContext,
  declarations: readonly CompiledDeclaration[],
  hasComponents: boolean,
  foreignImports: string,
): string {
  const path = resolvePath(paths, module.path)
  const componentImport = hasComponents
    ? `import * as _Views from ${compileModuleImport(path, resolveViewsPath(path))};`
    : ''
  const bindingTypes = compileBindingTypes(module, paths, context)
  const aliasesCode = compileAliases(module, paths)
  const bindingsCode = joinCodeLines(
    ...declarations.filter(item => !AST.IsLetDeclaration(item.node)).map(item => item.compiled.initialization),
  )
  const valuesCode = declarations.filter(item => AST.IsLetDeclaration(item.node)).map(item =>
    S`
      export function initialize${(item.node as AST.LetDeclaration).name.value}(_Scope: Scope): void {
        ${item.compiled.initialization}
      }
    `
  ).join('\n\n')
  return S`
    import * as TR from '@runtime';
    ${componentImport}
    ${foreignImports}
    ${bindingTypes}

    export function bindAliases(_Scope: Scope, _Modules: Readonly<Record<string, TR.Scope>>): void {
      ${aliasesCode}
    }

    export function bindDeclarations(_Scope: Scope): void {
      ${bindingsCode}
    }

    ${valuesCode}
  `
}

function compileAliases(module: LinkedModule, paths: GeneratedPaths): string {
  return module.bindings.map(binding => {
    const targetScope = `_Modules[${emitStringLiteral(resolvePath(paths, binding.source))}]!`
    return RuntimeEmitter.emitModuleBinding(binding, '_Scope', targetScope)
  }).join('\n')
}

function compileBindingTypes(
  module: LinkedModule,
  paths: GeneratedPaths,
  context: DeclarationCompiler.DeclarationContext,
): string {
  const members = AST.GetDeclarations(module.document).filter(AST.IsValueDeclaration).map(node => {
    const type = resolveBindingType(node, context)
    return `readonly ${emitStringLiteral(node.name.value)}: ${type};`
  })
  const aliases: string[] = []
  const projections: string[] = []
  const imports: string[] = []
  const importedSources = new Map<string, string>()
  for (const binding of module.bindings) {
    let importedScope = importedSources.get(binding.source)
    if (importedScope === undefined) {
      importedScope = `ImportedScope${importedSources.size}`
      importedSources.set(binding.source, importedScope)
      const path = compileModuleImport(resolvePath(paths, module.path), resolvePath(paths, binding.source))
      imports.push(`import type { Scope as ${importedScope} } from ${path};`)
    }
    aliases.push(`readonly ${emitStringLiteral(binding.name)}: ${importedScope}[${emitStringLiteral(binding.target)}];`)
    projections.push(
      `readonly ${emitStringLiteral(binding.name)}: Pick<${importedScope}, ${emitStringLiteral(binding.target)}>;`,
    )
  }
  return joinTextLines(
    imports.join('\n'),
    '',
    'export type Scope = {',
    `  ${[...members, ...aliases].join('\n  ')}`,
    '};',
    '',
    'export type Imports = {',
    `  ${projections.join('\n  ')}`,
    '};',
  )
}

function resolveBindingType(node: AST.ValueDeclaration, context: DeclarationCompiler.DeclarationContext): string {
  if (!AST.IsLetDeclaration(node)) {
    return 'TR.View'
  }
  if (context.textBindings.has(node.name.value)) {
    return 'string'
  }
  return 'unknown'
}

function compileBootstrap(
  program: LinkedProgram,
  paths: GeneratedPaths,
  selected: SelectedApp,
  revision: string,
): string {
  const imports = program.modules.map((module, index) =>
    `import * as Source${index} from ${compileModuleImport('App.tsx', resolvePath(paths, module.path))};`
  )
  const scopes = program.modules.map((_module, index) =>
    RuntimeEmitter.emitScope(`_scope${index}`, `Source${index}.Scope`)
  )
  const moduleScopesCode = program.modules.map((module, index) =>
    `${emitStringLiteral(resolvePath(paths, module.path))}: _scope${index}`
  ).join(',\n')
  const aliases = program.modules.map((_module, index) => `Source${index}.bindAliases(_scope${index}, _Modules);`)
  const views = program.modules.map((_module, index) => `Source${index}.bindDeclarations(_scope${index});`)
  const values = program.definitions.map(definition => {
    const index = program.modules.findIndex(module => module.path === definition.source)
    return `Source${index}.initialize${definition.declaration.name.value}(_scope${index});`
  })
  const selectedIndex = program.modules.findIndex(module => module.path === selected.source)
  return S`
    import * as TR from '@runtime';
    ${imports.join('\n')}

    ${RuntimeEmitter.emitModuleApplied(revision)}
    ${scopes.join('\n')}
    const _Modules = { ${moduleScopesCode} };
    ${aliases.join('\n')}
    ${views.join('\n')}
    ${values.join('\n')}

    export default function App() {
      return ${RuntimeEmitter.emitAppDeclaration(selected.declaration, `_scope${selectedIndex}`, revision)};
    }
  `
}

function resolvePath(paths: GeneratedPaths, source: string): string {
  return paths.get(source) ?? Errors.ThrowShouldNeverHappen(`Missing generated source path: ${source}.`)
}

function selectApp(program: LinkedProgram, appName?: string): SelectedApp {
  const entry = program.modules.find(module => module.path === program.entry)
  if (entry === undefined) {
    Errors.ThrowShouldNeverHappen(`Linked entry module is missing from the program: ${program.entry}.`)
  }
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
  if (binding === undefined) {
    Errors.ThrowUserInput(`Unknown Tao app: ${appName}.`)
  }
  const owner = program.modules.find(module => module.path === binding.source)
  const declaration = owner && AST.FindAppDeclaration(owner.document, binding.target)
  return declaration ? { source: binding.source, declaration } : Errors.ThrowUserInput(`Unknown Tao app: ${appName}.`)
}
