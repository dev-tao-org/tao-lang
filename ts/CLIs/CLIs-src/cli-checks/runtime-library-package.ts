import * as Runtime from '@runtime'
import { Json, NewlineCharacter } from '@shared'
import { FS, Path, Repo } from '@shared/os'

import type { RuntimeSourceContents, RuntimeSourcePaths } from './runtime-sources'

/** resolveLibraryRuntimeResources lists the shared client package resources needed by a complete build. */
export function resolveLibraryRuntimeResources(sourcePaths: RuntimeSourcePaths): string[] {
  const initial = ['package.json', AssetDeclarationsPath]
  const clientFiles = listLibraryClientSources(sourcePaths).map(([resource]) => resource)
  return [...initial, ...clientFiles].map(path => `${Runtime.RuntimeLibraryResourceDirectory}/${path}`)
}

/** writeRuntimeLibraryPackage publishes the shared runtime as ordinary relocatable TypeScript sources. */
export async function writeRuntimeLibraryPackage(
  directory: string,
  sources: RuntimeSourceContents,
  sourcePaths: RuntimeSourcePaths,
  pins: Runtime.RuntimePackageVersions,
): Promise<void> {
  const Workspace = await import('@workspace')
  const root = Path.join(directory, Runtime.RuntimeLibraryResourceDirectory)
  for (const [resource, sourcePath] of listLibraryClientSources(sourcePaths)) {
    const target = Path.join(root, resource)
    const source = sources[Repo.resolvePath(sourcePath)]!
    await FS.mkdir(Path.dirname(target))
    await FS.writeFile(target, relocateRuntimeImports(resource, source))
  }
  await FS.writeFile(Path.join(root, AssetDeclarationsPath), Workspace.SidecarAssetDeclarations)
  await FS.writeJson(Path.join(root, 'package.json'), {
    name: Runtime.RuntimeLibraryPackageName,
    version: Runtime.RuntimeLibraryPackageVersion,
    type: 'module',
    exports: {
      './generated': './runtime/TR.ts',
      './runtime-api': './runtime/TaoRuntimeAPI.ts',
    },
    peerDependencies: { 'react': pins.react!, 'react-native': pins['react-native']! },
    dependencies: { '@preact/signals-core': pins['@preact/signals-core']!, 'zod': pins.zod! },
  })
}

function listLibraryClientSources(sourcePaths: RuntimeSourcePaths): [string, string][] {
  return Object.entries(sourcePaths).filter(([resource]) => resource !== 'runtime/Bridge_expo.ts')
}

const RuntimeImportRegx = /(\bfrom\s+)(['"])(@shared(?:\/os\/preview)?)\2/g
const GeneratedRuntimePath = 'runtime/TR.ts'
const AssetDeclarationsPath = 'runtime/tao-assets.d.ts'

function relocateRuntimeImports(resource: string, source: string): string {
  if (resource === GeneratedRuntimePath) {
    const reference = Path.toRelativeModuleSpecifier(Path.relative(Path.dirname(resource), AssetDeclarationsPath))
    source = `/// <reference path=${Json.Print(reference)} />` + NewlineCharacter + source
  }
  return source.replace(RuntimeImportRegx, (_match, prefix: string, _quote: string, specifier: string) => {
    const target = specifier === '@shared' ? 'shared/shared' : 'shared/os/preview/PreviewPlatform'
    const relative = Path.toPortablePath(Path.relative(Path.dirname(resource), target))
    return prefix + Json.Print(Path.toRelativeModuleSpecifier(relative))
  })
}
