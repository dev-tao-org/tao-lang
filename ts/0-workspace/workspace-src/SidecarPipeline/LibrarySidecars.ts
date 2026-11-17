import * as Compile from '@compile'
import { Errors, Regxs } from '@shared'
import { Path, Text } from '@shared/os'
import * as Typecheck from '@typecheck'

import { isScriptSource, rewriteModuleSpecifiers } from './Imports'
import { collectLibrarySidecars } from './SidecarPipeline'

/** LibrarySidecars supplies portable source bytes and program-owned foreign view imports. */
export type LibrarySidecars = {
  files: ReadonlyMap<string, Uint8Array>
  resolveImport(modulePath: string, authoredPath: string, outputPath: string): string
}

/** captureLibrarySidecars places reachable foreign source beside the generated module graph. */
export async function captureLibrarySidecars(
  program: Typecheck.LinkedProgram,
  projectRoot: string,
  facadeSpecifiers: ReadonlySet<string>,
): Promise<LibrarySidecars> {
  const groups = await collectLibrarySidecars(program, projectRoot)
  const files = new Map<string, Uint8Array>()
  const targets = new Map<string, string>()
  for (const [index, group] of groups.entries()) {
    const directory = `ts/sidecars/${index + 1}`
    const localSpecifiers = group.views[0]?.module.project?.root === projectRoot
      ? facadeSpecifiers
      : EmptyFacadeSpecifiers
    for (const [path, bytes] of group.files) {
      const relative = Path.toPortablePath(Path.relative(group.moduleRoot, path))
      const outputPath = `${directory}/${relative}`
      files.set(outputPath, prepareSidecarBytes(outputPath, bytes, localSpecifiers))
    }
    for (const view of group.views) {
      const authoredPath = Path.resolve(group.moduleRoot, view.relativeSidecarPath)
      const key = Typecheck.createModuleMemberKey(view.module.path, authoredPath)
      const relative = Path.toPortablePath(view.relativeSidecarPath)
      targets.set(key, `${directory}/${relative}`)
    }
  }
  return {
    files,
    resolveImport(modulePath, authoredPath, outputPath) {
      const source = Path.resolve(Path.dirname(modulePath), authoredPath)
      const key = Typecheck.createModuleMemberKey(modulePath, source)
      const target = targets.get(key) ?? Errors.ThrowShouldNeverHappen(`Missing library sidecar: ${authoredPath}.`)
      return Compile.resolveModuleSpecifier(outputPath, target)
    },
  }
}

const EmptyFacadeSpecifiers: ReadonlySet<string> = new Set()

function prepareSidecarBytes(path: string, bytes: Uint8Array, facadeSpecifiers: ReadonlySet<string>): Uint8Array {
  if (Regxs.TaoSourceExtensionRegx.test(path)) {
    Errors.ThrowUserInput(`A published TypeScript sidecar cannot include Tao source: ${path}.`)
  }
  if (!isScriptSource(path)) {
    return bytes
  }
  const source = Text.decodeUtf8(bytes)
  const rewritten = rewriteModuleSpecifiers(
    source,
    specifier => resolveModuleSpecifier(path, specifier, facadeSpecifiers),
  )
  return Text.encodeUtf8(rewritten)
}

function resolveModuleSpecifier(path: string, specifier: string, facadeSpecifiers: ReadonlySet<string>): string {
  if (Path.isAbsolute(specifier) || specifier.startsWith('file:')) {
    Errors.ThrowUserInput(`A published TypeScript sidecar requires portable imports: ${specifier} in ${path}.`)
  }
  if (specifier === '@tao/runtime-api') {
    return '@tao/runtime/runtime-api'
  }
  if (!facadeSpecifiers.has(specifier)) {
    return specifier
  }
  if (Path.posix.normalize(specifier) !== specifier) {
    Errors.ThrowUserInput(`Invalid published Tao package subpath: ${specifier}.`)
  }
  return Compile.resolveModuleSpecifier(path, `ts/${specifier}.ts`)
}
