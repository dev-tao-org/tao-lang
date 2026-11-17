import { Errors } from '@shared'
import { Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import type { CompiledFiles } from '../compile-src/Compile'

/** executeGeneratedFiles loads an emitted module map with an injected runtime boundary. */
export function executeGeneratedFiles(
  files: CompiledFiles,
  runtime: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const cache = new Map<string, GeneratedModule>()
  return loadGeneratedModule('App.tsx', files, runtime, cache)
}

/** transpileGeneratedFiles checks generated TypeScript syntax without executing the modules. */
export function transpileGeneratedFiles(files: CompiledFiles): void {
  for (const [path, source] of Object.entries(files)) {
    transpile(source, path)
  }
}

function loadGeneratedModule(
  path: string,
  files: CompiledFiles,
  runtime: Readonly<Record<string, unknown>>,
  cache: Map<string, GeneratedModule>,
): Record<string, unknown> {
  const cached = cache.get(path)
  if (cached) {
    return cached.exports
  }
  const source = files[path] ?? Errors.ThrowShouldNeverHappen(`Generated module is missing: ${path}.`)
  const module = { exports: {} as Record<string, unknown> }
  cache.set(path, module)
  const requireModule = (specifier: string) => {
    if (specifier === '@tao/runtime/generated') {
      return runtime
    }
    if (specifier === '@tao/runtime/runtime-api') {
      return { default: {} }
    }
    const target = resolveGeneratedPath(path, specifier, files)
    return loadGeneratedModule(target, files, runtime, cache)
  }
  const generatedJavaScript = transpile(source, path)
  const runModule = new Function('require', 'module', 'exports', generatedJavaScript) as (
    requireModule: (specifier: string) => unknown,
    module: GeneratedModule,
    exports: Record<string, unknown>,
  ) => void
  runModule(requireModule, module, module.exports)
  return module.exports
}

function resolveGeneratedPath(
  parent: string,
  specifier: string,
  files: CompiledFiles,
): string {
  const target = Path.join(Path.dirname(parent), specifier)
  const candidates = [`${target}.ts`, `${target}.tsx`, target]
  const resolved = candidates.find(candidate => hasGeneratedFile(candidate, files))
  if (resolved === undefined) {
    Errors.ThrowShouldNeverHappen(`Generated import ${specifier} from ${parent} is missing.`)
  }
  return resolved
}

function hasGeneratedFile(path: string, files: CompiledFiles): boolean {
  return path in files
}

function transpile(source: string, path: string): string {
  const output = TypeScript.transpileModule(source, {
    fileName: path,
    compilerOptions: { module: TypeScript.ModuleKind.CommonJS, target: TypeScript.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  })
  const errors = collectTranspileErrors(output)
  if (errors.length > 0) {
    Errors.ThrowUserInput(
      `Generated TypeScript failed to transpile in ${path}: ${errors.map(error => error.messageText).join('; ')}`,
    )
  }
  return output.outputText
}

type GeneratedModule = { exports: Record<string, unknown> }

function collectTranspileErrors(output: TypeScript.TranspileOutput): TypeScript.Diagnostic[] {
  if (!output.diagnostics) {
    return []
  }
  return output.diagnostics.filter(diagnostic => diagnostic.category === TypeScript.DiagnosticCategory.Error)
}
