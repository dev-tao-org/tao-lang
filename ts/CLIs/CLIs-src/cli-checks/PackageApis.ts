import { Errors, Json } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { TypeScript } from '../../../shared/shared-src/bridges/Bridge_typescript'

/** PackageApi describes one manifest-owned exact public file and its canonical import name. */
export type PackageApi = { alias: string; namespace: string; filename: string; entities?: readonly string[] }
/** CompilerPaths maps exact public import names to their TypeScript file entrypoints. */
export type CompilerPaths = Record<string, string[]>

type ManifestPublicApis = Record<string, { alias: string; namespace: string; entities?: string[] }>
type PackageApiManifest = { exports: Record<string, string>; tao: { publicApi: ManifestPublicApis } }

// Read exact entrypoints without traversing fixture packages.
function readPackageApis(root = Repo.getWorkspaceRoot()): PackageApi[] {
  const manifestFiles = TypeScript.sys.readDirectory(Path.join(root, 'ts'), ['.json'], ['**/node_modules/**'], [
    '*/package.json',
    'ide-extensions/*/package.json',
  ])
  return manifestFiles.flatMap(filename => readManifestApis(filename))
}

/** deriveCompilerPaths derives aliases relative to a chosen configuration directory. */
export function deriveCompilerPaths(directory: string, apis = readPackageApis()): CompilerPaths {
  const paths: CompilerPaths = {}
  for (const api of apis) {
    const relative = Path.relative(directory, api.filename).replaceAll('\\', '/')
    paths[api.alias] = [relative.startsWith('.') ? relative : `./${relative}`]
  }
  return paths
}

/** synchronizePackageApis updates the compiler alias snapshot from package-owned public APIs. */
export function synchronizePackageApis(root = Repo.getWorkspaceRoot()): void {
  const configPath = Path.join(root, 'ts/tsconfig.base.json')
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile).config
  config.compilerOptions.paths = deriveCompilerPaths(Path.dirname(configPath), readPackageApis(root))
  FS.writeFileSync(configPath, `${serializeCompilerConfig(config)}\n`)
}

function serializeCompilerConfig(config: unknown): string {
  return Json.PrintIndented(config)
}

/** assertPackageApis checks manifest ownership, exact files and the generated compiler alias snapshot. */
export function assertPackageApis(root = Repo.getWorkspaceRoot()): void {
  const apis = readPackageApis(root)
  const aliases = new Set<string>()
  for (const api of apis) {
    if (aliases.has(api.alias)) {
      Errors.ThrowUserInput(`Public import alias is declared more than once: ${api.alias}`)
    }
    aliases.add(api.alias)
    requirePublicApiFile(api)
  }
  const configPath = Path.join(root, 'ts/tsconfig.base.json')
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile).config
  const expected = deriveCompilerPaths(Path.dirname(configPath), apis)
  if (!haveEqualCompilerPaths(config.compilerOptions.paths, expected)) {
    Errors.ThrowUserInput(
      'TypeScript paths must match manifest-owned exact public APIs. Run ./agent fix.',
    )
  }
}

function readManifestApis(filename: string): PackageApi[] {
  const source = FS.readFileSync(filename, 'utf8')
  const parsed = TypeScript.parseConfigFileTextToJson(filename, source)
  if (parsed.error) {
    Errors.ThrowUserInput(`Cannot read public APIs from ${filename}`)
  }
  const manifest = parsed.config as Partial<PackageApiManifest>
  const entries = manifest.tao?.publicApi
  if (entries === undefined) {
    return []
  }
  return Object.entries(entries).map(([key, metadata]) => {
    const target = manifest.exports?.[key]
    requirePublicApiMetadata(filename, key, target, metadata)
    return {
      alias: metadata.alias,
      namespace: metadata.namespace,
      entities: metadata.entities,
      filename: Path.resolve(Path.dirname(filename), target),
    }
  })
}

function requirePublicApiMetadata(
  filename: string,
  key: string,
  target: unknown,
  metadata: { alias: string; namespace: string },
): asserts target is string {
  const exactTarget = typeof target === 'string' && target.startsWith('./') && !target.includes('*')
  const validMetadata = typeof metadata.alias === 'string' && typeof metadata.namespace === 'string'
  const wildcardApi = key.includes('*') || metadata.alias.includes('*')
  if (!exactTarget || !validMetadata || wildcardApi) {
    Errors.ThrowUserInput(`Public APIs require exact file exports and canonical namespace metadata: ${filename} ${key}`)
  }
}

function requirePublicApiFile(api: PackageApi): void {
  if (!FS.existsSync(api.filename) || !FS.statSync(api.filename).isFile()) {
    Errors.ThrowUserInput(`Public API must point to an existing file: ${api.alias} -> ${api.filename}`)
  }
}

function haveEqualCompilerPaths(actual: CompilerPaths, expected: CompilerPaths): boolean {
  const keys = Object.keys(expected)
  return Object.keys(actual).length === keys.length
    && keys.every(key => actual[key]?.length === expected[key].length && actual[key][0] === expected[key][0])
}

// Own the namespace and primary entities published by an exact package entrypoint.
type PackageImportRule = { namespace: string; entities?: readonly string[] }
/** PackageImportRules maps public import aliases to their canonical access rules. */
export type PackageImportRules = ReadonlyMap<string, PackageImportRule>

/** readPackageImportRules derives canonical operation-family access from manifests. */
export function readPackageImportRules(root: string): PackageImportRules {
  return new Map(readPackageApis(root).map(api => [api.alias, { namespace: api.namespace, entities: api.entities }]))
}

/** packageNamespaceIssue checks canonical namespaces and qualified operation-family imports. */
export function packageNamespaceIssue(
  node: TypeScript.ImportDeclaration,
  namespaces: PackageImportRules,
): string | undefined {
  if (!TypeScript.isStringLiteral(node.moduleSpecifier)) {
    return
  }
  const rule = namespaces.get(node.moduleSpecifier.text)
  const canonical = rule?.namespace
  const bindings = node.importClause?.namedBindings
  if (canonical === undefined || bindings === undefined) {
    return
  }
  if (TypeScript.isNamespaceImport(bindings)) {
    return bindings.name.text === canonical ? undefined : `use canonical namespace ${canonical}`
  }
  const operation = bindings.elements.find(element =>
    !isPrimaryEntity((element.propertyName ?? element.name).text, rule!)
  )
  if (operation) {
    return `import operations through import * as ${canonical}; retain narrow imports for primary entities and types`
  }
}

function isPrimaryEntity(name: string, rule: PackageImportRule): boolean {
  return name === rule.namespace || rule.entities?.includes(name) === true
}
