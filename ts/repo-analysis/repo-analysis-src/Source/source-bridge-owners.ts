import { Regxs } from '@shared'
import { Path, Platform } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'

/** SourceBridgeContext identifies internal package names and configured aliases for one workspace. */
export type SourceBridgeContext = { root: string; packageNames: ReadonlySet<string>; pathAliases: readonly string[] }

/** createSourceBridgeContext loads internal module names from workspace manifests and TypeScript paths. */
export function createSourceBridgeContext(root: string): SourceBridgeContext {
  return {
    root,
    packageNames: collectWorkspacePackageNames(root),
    pathAliases: readConfiguredPathAliases(root),
  }
}

/** sourceBridgeOwnerIssue checks package ownership while allowing configured workspace imports. */
export function sourceBridgeOwnerIssue(
  filename: string,
  specifier: string,
  context: SourceBridgeContext,
): string | undefined {
  if (isInternalSpecifier(specifier, context)) {
    return
  }
  const owner = bridgeOwners.find(candidate => candidate.packageName === packageRoot(specifier))
  if (owner === undefined) {
    return `external module "${specifier}" has no registered bridge owner`
  }
  if (!isOwnerPath(filename, owner)) {
    return `external module "${specifier}" belongs in ${owner.path}`
  }
}

type OptionalPathAliases = Record<string, unknown> | undefined

type BridgeOwner = { packageName: string; path: string; folder?: boolean }

const bridgeOwners: BridgeOwner[] = [
  { packageName: 'typescript', path: 'ts/shared/shared-src/bridges/Bridge_typescript.ts' },
  { packageName: 'zod', path: 'ts/shared/shared-src/bridges/Bridge_zod.ts' },
  { packageName: 'node', path: 'ts/shared/shared-src/os/bridges/Bridge_node', folder: true },
  { packageName: 'bun', path: 'ts/shared/shared-src/os/bridges/Bridge_bun', folder: true },
  { packageName: 'chokidar', path: 'ts/shared/shared-src/os/bridges/Bridge_chokidar.ts' },
  { packageName: 'memfs', path: 'ts/shared/shared-src/os/bridges/Bridge_memfs.ts' },
  { packageName: 'node-addon-api', path: 'ts/shared/shared-src/os/bridges/Bridge_node-addon-api.ts' },
  { packageName: 'node-gyp', path: 'ts/shared/shared-src/os/bridges/Bridge_node-gyp.ts' },
  { packageName: 'playwright', path: 'ts/shared/shared-src/os/bridges/Bridge_playwright.ts' },
  { packageName: '@dprint/typescript', path: 'ts/shared/shared-src/os/bridges/Bridge_dprint-typescript.ts' },
  { packageName: '@dprint/formatter', path: 'ts/4-fix/fix-src/lib/formatter/Bridge_dprint-formatter', folder: true },
  { packageName: 'semver', path: 'ts/0-workspace/workspace-src/bridges/Bridge_semver.ts' },
  { packageName: 'tree-sitter', path: 'ts/1-grammar/grammar-src/bridges/Bridge_tree-sitter.ts' },
  { packageName: 'react', path: 'ts/7-runtime/runtime-src/client/Bridge_react', folder: true },
  { packageName: 'react-native', path: 'ts/7-runtime/runtime-src/client/Bridge_react-native.ts' },
  { packageName: '@preact/signals-core', path: 'ts/7-runtime/runtime-src/client/Bridge_preact-signals-core.ts' },
  { packageName: 'react-dom', path: 'ts/7-runtime/test-runtime/bridges/Bridge_react-dom.ts' },
  { packageName: 'ink', path: 'ts/CLIs/CLIs-src/cli-kit/bridges/Bridge_ink.ts' },
  { packageName: 'wrap-ansi', path: 'ts/CLIs/CLIs-src/cli-kit/bridges/Bridge_wrap-ansi.ts' },
  { packageName: 'commander', path: 'ts/CLIs/CLIs-src/cli-kit/bridges/Bridge_commander.ts' },
  {
    packageName: 'dependency-cruiser',
    path: 'ts/repo-analysis/repo-analysis-src/PackageGraph/Bridge_dependency-cruiser.ts',
  },
  { packageName: 'rulesync', path: 'ts/CLIs/CLIs-src/cli-kit/bridges/Bridge_rulesync.ts' },
  { packageName: 'vscode', path: 'ts/ide-extensions/bridges/Bridge_vscode.ts' },
  {
    packageName: 'web-tree-sitter',
    path: 'ts/ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_web-tree-sitter.ts',
  },
  { packageName: 'expo', path: 'ts/7-runtime/runtime-src/bridges/Bridge_expo', folder: true },
  { packageName: '@expo/cli', path: 'ts/7-runtime/runtime-src/bridges/Bridge_expo-cli', folder: true },
  { packageName: '@expo/metro', path: 'ts/7-runtime/runtime-src/bridges/Bridge_expo-metro', folder: true },
  { packageName: '@expo/metro-file-map', path: 'ts/7-runtime/runtime-src/bridges/Bridge_expo-metro-file-map.ts' },
  { packageName: 'metro', path: 'ts/7-runtime/runtime-src/bridges/Bridge_metro.ts' },
  {
    packageName: 'tree-sitter-typescript',
    path: 'ts/ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_tree-sitter-typescript.ts',
  },
  {
    packageName: 'tree-sitter-javascript',
    path: 'ts/ide-extensions/tao-ide-extension/tao-ide-extension-src/Bridge_tree-sitter-javascript.ts',
  },
]

function isInternalSpecifier(specifier: string, context: SourceBridgeContext): boolean {
  const filePath = specifier.startsWith('.') || specifier.startsWith('/')
    || Regxs.WindowsAbsolutePathRegx.test(specifier)
  const localPackage = specifier.startsWith('tao:') || context.packageNames.has(packageRoot(specifier))
  return filePath || localPackage || context.pathAliases.some(alias => matchesPathAlias(specifier, alias))
}

function collectWorkspacePackageNames(root: string): Set<string> {
  const packageFiles = TypeScript.sys.readDirectory(
    Path.join(root, 'ts'),
    ['.json'],
    ['**/node_modules/**', '**/.artifacts/**', '**/_gen_*/**', '**/generated/**', '**/vendor/**', '**/third-party/**'],
    ['*/package.json', 'ide-extensions/*/package.json'],
  )
  const packageNames = new Set<string>()
  for (const packageFile of packageFiles) {
    const source = TypeScript.sys.readFile(packageFile)
    if (source !== undefined) {
      const parsed = TypeScript.parseConfigFileTextToJson(packageFile, source)
      const packageName = parsed.config?.name
      if (typeof packageName === 'string' && packageName.startsWith('@tao/')) {
        packageNames.add(packageName)
      }
    }
  }
  return packageNames
}

function readConfiguredPathAliases(root: string): string[] {
  const configPath = Path.join(root, 'ts/tsconfig.base.json')
  const source = TypeScript.sys.readFile(configPath)
  if (source === undefined) {
    return []
  }
  const parsed = TypeScript.parseConfigFileTextToJson(configPath, source)
  const paths = parsed.config?.compilerOptions?.paths as OptionalPathAliases
  return paths === undefined ? [] : Object.keys(paths)
}

function matchesPathAlias(specifier: string, alias: string): boolean {
  const wildcardIndex = alias.indexOf('*')
  if (wildcardIndex < 0) {
    return specifier === alias
  }
  const prefix = alias.slice(0, wildcardIndex)
  const suffix = alias.slice(wildcardIndex + 1)
  return specifier.startsWith(prefix) && specifier.endsWith(suffix)
}

function packageRoot(specifier: string): string {
  if (Platform.isPlatformImport(specifier)) {
    return specifier === 'bun' || specifier.startsWith('bun:') ? 'bun' : 'node'
  }
  const segments = specifier.split('/')
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

function isOwnerPath(filename: string, owner: BridgeOwner): boolean {
  const normalizedFilename = filename.replaceAll('\\', '/')
  return owner.folder
    ? normalizedFilename.startsWith(owner.path + '/')
    : normalizedFilename === owner.path
}
