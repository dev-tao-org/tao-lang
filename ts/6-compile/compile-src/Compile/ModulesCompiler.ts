import * as AST from '@ast-gen'
import { Errors, NewlineCharacter, Objects, S, Timings, UserInput } from '@shared'
import * as Shared from '@shared'
import { Platform } from '@shared/os'
import * as Typecheck from '@typecheck'

import { emitStringLiteral, joinCodeBlocks, joinCodeLines } from '../codegen-util'
import * as DeclarationCompiler from '../DeclarationCompiler'
import * as ForeignViewsCompiler from '../ForeignViewsCompiler'
import { compileModuleImport, createGeneratedPaths, resolveViewsPath } from '../GeneratedPaths'
import type { GeneratedModulePaths } from '../GeneratedPaths'
import { compileModuleInitialization } from '../ModuleInitialization'
import { buildModuleTextBindings, type ModuleTextBindingsBySourcePath } from '../ModuleTextBindings'
import * as RuntimeEmitter from '../RuntimeEmitter'

export type { ForeignViewPathResolver } from '../ForeignViewsCompiler'

/** CompiledFiles maps generated relative module paths to their emitted TypeScript source. */
export type CompiledFiles = Readonly<MutableCompiledFiles>

/** compileProgram emits source-owned modules and one ordered, revision-bearing bootstrap.
 *  Components receive lexical records through props; binding-type imports erase at runtime. */
export const compileProgram = Timings.createTopLevelTimer(function(
  timings,
  program: Typecheck.LinkedProgram,
  revision: string,
  appName?: string,
  resolveForeignViewPath?: ForeignViewsCompiler.ForeignViewPathResolver,
): CompiledFiles {
  const selected = selectApp(program, appName)
  const sources = timings.run(compileModuleSources, program, resolveForeignViewPath)
  const files = Objects.copy(sources.files)
  files['App.tsx'] = compileBootstrap(program, selected, revision, sources.paths)
  return files
})

type CompiledModuleSources = { files: CompiledFiles; paths: GeneratedModulePaths }

/** compileModuleSources emits shared declaration bodies and derives their output paths once per compilation. */
export const compileModuleSources = Timings.createTopLevelTimer(function(
  timings,
  program: Typecheck.LinkedProgram,
  resolveForeignViewPath?: ForeignViewsCompiler.ForeignViewPathResolver,
): CompiledModuleSources {
  const paths = createGeneratedPaths(program)
  const textBindings = buildModuleTextBindings(program)
  const files: MutableCompiledFiles = {}
  for (const module of program.modules) {
    const path = resolvePath(paths, module.path)
    const generated = timings.run(compileSource, module, program, paths, textBindings, resolveForeignViewPath)
    files[path] = generated.main
    if (generated.views) {
      files[resolveViewsPath(path)] = generated.views
    }
  }
  return { files, paths }
})

type GeneratedSource = { main: string; views: string }
type MutableCompiledFiles = Record<string, string>
type SelectedApp = { source: string; declaration: AST.AppDeclaration }
type CompiledDeclaration = { node: AST.Declaration; compiled: DeclarationCompiler.DeclarationCompilation }

const compileSource = Timings.measured('compiler.emit-module', function(
  module: Typecheck.LinkedModule,
  program: Typecheck.LinkedProgram,
  paths: GeneratedModulePaths,
  textBindings: ModuleTextBindingsBySourcePath,
  resolveForeignViewPath?: ForeignViewsCompiler.ForeignViewPathResolver,
): GeneratedSource {
  const sourceProgram = selectSourceProgram(program, module)
  const mainPath = resolvePath(paths, module.path)
  const foreign = ForeignViewsCompiler.compileForeignViews(sourceProgram, mainPath, resolveForeignViewPath)
  const context = createModuleCompilationContext(module, mainPath, textBindings, foreign.names)
  const declarations = AST.GetDeclarations(module.document).map(node => ({
    node,
    compiled: DeclarationCompiler.compileDeclaration(node, context),
  }))
  const components = joinCodeBlocks(...declarations.map(item => item.compiled.components))
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
})

function selectSourceProgram(
  program: Typecheck.LinkedProgram,
  module: Typecheck.LinkedModule,
): Typecheck.LinkedProgram {
  return { ...program, modules: [module] }
}

function createModuleCompilationContext(
  module: Typecheck.LinkedModule,
  generatedPath: string,
  textBindings: ModuleTextBindingsBySourcePath,
  foreignNames: ForeignViewsCompiler.ForeignViewNamesByModuleMemberKey,
): DeclarationCompiler.DeclarationContext {
  return {
    scope: '_Scope',
    scopeType: 'ModuleScope',
    componentPrefix: '_Views.',
    moduleIdentity: Platform.hashText(generatedPath).slice(0, 12),
    textBindings: textBindings.get(module.path) ?? new Set(),
    moduleBindings: module.bindings,
    resolveForeignComponent: node => foreignNames.get(Typecheck.createModuleMemberKey(module.path, node.range.start)),
  }
}

function compileMain(
  module: Typecheck.LinkedModule,
  paths: GeneratedModulePaths,
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
  ).join(NewlineCharacter + NewlineCharacter)
  return S`
    ${RuntimeEmitter.emitGeneratedRuntimeImport()}
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

function compileAliases(module: Typecheck.LinkedModule, paths: GeneratedModulePaths): string {
  return module.bindings.map(binding => {
    const targetScope = `_Modules[${emitStringLiteral(resolvePath(paths, binding.source))}]!`
    return RuntimeEmitter.emitModuleBinding(binding, '_Scope', targetScope)
  }).join(NewlineCharacter)
}

function compileBindingTypes(
  module: Typecheck.LinkedModule,
  paths: GeneratedModulePaths,
  context: DeclarationCompiler.DeclarationContext,
): string {
  const members = AST.GetValueDeclarations(module.document).map(node => {
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
  return Shared.joinTextLines(
    imports.join(NewlineCharacter),
    '',
    'export type Scope = {',
    `  ${[...members, ...aliases].join(NewlineCharacter + '  ')}`,
    '};',
    '',
    'export type Imports = {',
    `  ${projections.join(NewlineCharacter + '  ')}`,
    '};',
  )
}

function resolveBindingType(node: AST.ValueDeclaration, context: DeclarationCompiler.DeclarationContext): string {
  if (AST.IsKind(node, 'FunctionDeclaration')) {
    return 'TR.TextFunction'
  }
  if (!AST.IsLetDeclaration(node)) {
    return 'TR.View'
  }
  if (context.textBindings.has(node.name.value)) {
    return 'TR.GeneratedValue<string>'
  }
  return 'unknown'
}

function compileBootstrap(
  program: Typecheck.LinkedProgram,
  selected: SelectedApp,
  revision: string,
  paths: GeneratedModulePaths,
): string {
  const initialization = compileModuleInitialization(program, 'App.tsx', paths)
  const scope = initialization.scopes.get(selected.source)!
  return S`
    ${RuntimeEmitter.emitGeneratedRuntimeImport()}
    ${initialization.imports}

    ${RuntimeEmitter.emitModuleApplied(revision)}
    ${initialization.body}

    export default function App() {
      return ${RuntimeEmitter.emitAppDeclaration(selected.declaration, scope, revision)};
    }
  `
}

function resolvePath(paths: GeneratedModulePaths, source: string): string {
  return paths.get(source) ?? Errors.ThrowShouldNeverHappen(`Missing generated source path: ${source}.`)
}

function selectApp(program: Typecheck.LinkedProgram, appName?: string): SelectedApp {
  const entry = program.modules.find(module => module.path === program.entry)
  if (entry === undefined) {
    Errors.ThrowShouldNeverHappen(`Linked entry module is missing from the program: ${program.entry}.`)
  }
  if (appName === undefined) {
    const apps = AST.GetAppDeclarations(entry.document)
    UserInput.require(apps.length === 1, 'Compile one app declaration per entry file.')
    return { source: entry.path, declaration: apps[0] }
  }
  const direct = AST.FindAppDeclaration(entry.document, appName)
  if (direct) {
    return { source: entry.path, declaration: direct }
  }
  const binding = entry.bindings.find(candidate => candidate.name === appName)
  if (binding === undefined) {
    UserInput.fail(`Unknown Tao app: ${appName}.`)
  }
  const owner = program.modules.find(module => module.path === binding.source)
  const declaration = owner && AST.FindAppDeclaration(owner.document, binding.target)
  return declaration ? { source: binding.source, declaration } : UserInput.fail(`Unknown Tao app: ${appName}.`)
}
