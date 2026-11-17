import { Errors, Regxs } from '@shared'
import { Path, Platform } from '@shared/os'
import type * as Typecheck from '@typecheck'
import { emitStringLiteral } from './codegen-util'

/** GeneratedModulePaths maps authored module identities to portable generated source paths. */
export type GeneratedModulePaths = ReadonlyMap<string, string>

/** createGeneratedPaths preserves source-file ownership without exposing absolute host paths. */
export function createGeneratedPaths(program: Typecheck.LinkedProgram): GeneratedModulePaths {
  const entry = program.modules.find(module => module.path === program.entry)!
  const projectRoot = entry.project?.root ?? Path.dirname(entry.path)
  const dependencies = new Map<string, string>()
  const dependencyNames = new Set<string>()
  const paths = new Map<string, string>()
  const outputs = new Set<string>()
  for (const module of program.modules) {
    const root = resolveModuleRoot(module, projectRoot)
    const directory = root === projectRoot
      ? 'ts/packages'
      : resolveDependencyDirectory(module, root, dependencies, dependencyNames)
    const path = resolveGeneratedModulePath(module.path, root, directory)
    const stem = path.replace(Regxs.TypeScriptFileExtensionRegx, '')
    if (outputs.has(stem)) {
      Errors.ThrowUserInput(`Generated source paths collide: ${path}.`)
    }
    outputs.add(stem)
    outputs.add(stem + '.views')
    paths.set(module.path, path)
  }
  return paths
}

/** compileModuleImport emits a portable import between two generated source units. */
export function compileModuleImport(from: string, to: string): string {
  const relative = Path.relative(Path.dirname(from), to).replaceAll('\\', '/').replace(
    Regxs.TypeScriptSourceExtensionRegx,
    '',
  )
  return emitStringLiteral(Path.toRelativeModuleSpecifier(relative))
}

/** resolveViewsPath names the component-only category of an input file. */
export function resolveViewsPath(main: string): string {
  return main.replace(Regxs.TypeScriptFileExtensionRegx, '.views.tsx')
}

function resolveGeneratedModulePath(source: string, root: string, directory: string): string {
  if (source === '<memory>') {
    return `${directory}/Memory.ts`
  }
  const relative = Path.relative(root, source).replaceAll('\\', '/')
  const stem = relative.replace(Regxs.TaoSourceExtensionRegx, '')
  return `${directory}/${escapeCategoryStem(stem)}.ts`
}

function resolveModuleRoot(module: Typecheck.LinkedModule, projectRoot: string): string {
  if (module.project) {
    return module.project.root
  }
  return Path.isWithin(projectRoot, module.path) ? projectRoot : Path.dirname(module.path)
}

function resolveDependencyDirectory(
  module: Typecheck.LinkedModule,
  root: string,
  dependencies: Map<string, string>,
  names: Set<string>,
): string {
  const existing = dependencies.get(root)
  if (existing !== undefined) {
    return existing
  }
  const base = module.project?.alias ?? 'project'
  let name = base
  for (let index = 2; names.has(name); index++) {
    name = `${base}-${index}`
  }
  names.add(name)
  const directory = `ts/dependencies/${name}`
  dependencies.set(root, directory)
  return directory
}

function escapeCategoryStem(stem: string): string {
  return Regxs.GeneratedModuleExtensionRegx.test(stem)
    ? `${stem}.source-${Platform.hashText(stem).slice(0, 8)}`
    : stem
}
