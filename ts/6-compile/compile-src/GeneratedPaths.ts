import { Errors, Regxs } from '@shared'
import { Path, Platform } from '@shared/os'
import type * as Typecheck from '@typecheck'
import { emitStringLiteral } from './codegen-util'

/** GeneratedModulePaths maps authored module identities to portable generated source paths. */
export type GeneratedModulePaths = ReadonlyMap<string, string>

/** createGeneratedPaths preserves source-file ownership without exposing absolute host paths. */
export function createGeneratedPaths(program: Typecheck.LinkedProgram): GeneratedModulePaths {
  const paths = new Map(
    program.modules.map(module => [module.path, resolveGeneratedModulePath(program.entry, module.path)]),
  )
  const outputs = new Set<string>()
  for (const path of paths.values()) {
    const stem = path.replace(Regxs.TypeScriptFileExtensionRegx, '')
    if (outputs.has(stem)) {
      Errors.ThrowUserInput(`Generated source paths collide: ${path}.`)
    }
    outputs.add(stem)
    outputs.add(stem + '.views')
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

function resolveGeneratedModulePath(entry: string, source: string): string {
  if (source === '<memory>') {
    return 'source/Memory.ts'
  }
  const normalized = source.replaceAll('\\', '/')
  const standardLibrary = normalized.split('/stdlib-src/')[1]
  if (standardLibrary !== undefined) {
    return `tao/${
      escapeCategoryStem(standardLibrary.replaceAll('@', '').replace(Regxs.TaoSourceExtensionRegx, ''), source)
    }.ts`
  }
  const relative = Path.relative(Path.dirname(entry), source).replaceAll('\\', '/')
  if (!relative.startsWith('../') && !Path.isAbsolute(relative)) {
    return `source/${escapeCategoryStem(relative.replace(Regxs.TaoSourceExtensionRegx, ''), source)}.ts`
  }
  const identity = Platform.hashText(source).slice(0, 12)
  const name = Path.basename(source).replace(Regxs.TaoSourceExtensionRegx, '')
  return `modules/${identity}/${escapeCategoryStem(name, source)}.ts`
}

function escapeCategoryStem(stem: string, source: string): string {
  return Regxs.GeneratedModuleExtensionRegx.test(stem)
    ? `${stem}.source-${Platform.hashText(source).slice(0, 8)}`
    : stem
}
