import { Json, UserInput } from '@shared'
import { FS, Path, Repo } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'
import * as PackageTests from './PackageTests'
import { readWorkspaceManifestPaths } from './WorkspaceManifests'

/** PackageApi describes one manifest-owned exact public file and its canonical import name. */
export type PackageApi = { alias: string; namespace: string; filename: string; entities?: readonly string[] }
/** CompilerPaths maps exact public import names to their TypeScript file entrypoints. */
export type CompilerPaths = Record<string, string[]>

type ManifestPublicApis = Record<string, { alias: string; namespace: string; entities?: string[] }>
type PackageApiManifest = { exports: Record<string, string>; tao: { publicApi: ManifestPublicApis } }

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

/** assertPackageApis checks manifest ownership, exact files and the generated compiler alias snapshot. */
export function assertPackageApis(root = Repo.getWorkspaceRoot()): void {
  const manifests = readWorkspaceManifestPaths(Path.join(root, 'ts'))
  for (const manifest of manifests) {
    PackageTests.assertPackageTests(manifest)
  }
  const apis = manifests.flatMap(readManifestApis)
  const aliases = new Set<string>()
  for (const api of apis) {
    if (aliases.has(api.alias)) {
      UserInput.fail(`Public import alias is declared more than once: ${api.alias}`)
    }
    aliases.add(api.alias)
    requirePublicApiFile(api)
  }
  const configPath = Path.join(root, 'ts/tsconfig.base.json')
  const config = TypeScript.readConfigFile(configPath, TypeScript.sys.readFile).config
  const expected = deriveCompilerPaths(Path.dirname(configPath), apis)
  UserInput.require(
    !!haveEqualCompilerPaths(config.compilerOptions.paths, expected),
    'TypeScript paths must match manifest-owned exact public APIs. Run ./agent fix.',
  )
}

// Own the namespace and primary entities published by an exact package entrypoint.
type PackageImportRule = { namespace: string; entities?: readonly string[] }
/** PackageImportRules maps public import aliases to their canonical access rules. */
export type PackageImportRules = ReadonlyMap<string, PackageImportRule>

/** readPackageImportRules derives canonical operation-family access from manifests. */
export function readPackageImportRules(root: string): PackageImportRules {
  if (!FS.existsSync(Path.join(root, 'ts/package.json'))) {
    return new Map()
  }
  return new Map(readPackageApis(root).map(api => [api.alias, { namespace: api.namespace, entities: api.entities }]))
}

/** packageNamespaceIssue checks canonical namespaces and qualified operation-family imports. */
export function packageNamespaceIssue(
  node: TypeScript.Node,
  namespaces: PackageImportRules,
): string | undefined {
  if (!TypeScript.isImportDeclaration(node)) {
    return dynamicNamespaceIssue(node, namespaces)
  }
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

/** readPackageApis reads exact entrypoints without traversing fixture packages. */
export function readPackageApis(root = Repo.getWorkspaceRoot()): PackageApi[] {
  return readWorkspaceManifestPaths(Path.join(root, 'ts')).flatMap(readManifestApis)
}

function serializeCompilerConfig(config: unknown): string {
  return Json.Print(config)
}

function readManifestApis(filename: string): PackageApi[] {
  const source = FS.readFileSync(filename, 'utf8')
  const parsed = TypeScript.parseConfigFileTextToJson(filename, source)
  if (parsed.error) {
    UserInput.fail(`Cannot read public APIs from ${filename}`)
  }
  const manifest = parsed.config as Partial<PackageApiManifest>
  const entries = manifest.tao?.publicApi
  requireExportMetadata(filename, manifest.exports, entries)
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

type OptionalManifestPublicApis = ManifestPublicApis | undefined

function requireExportMetadata(
  filename: string,
  exports: Partial<PackageApiManifest>['exports'],
  entries: OptionalManifestPublicApis,
): void {
  for (const key of Object.keys(exports ?? {})) {
    if (!Object.hasOwn(entries ?? {}, key)) {
      UserInput.fail(`Every export requires public API metadata: ${filename} ${key}`)
    }
  }
}

function requirePublicApiMetadata(
  filename: string,
  key: string,
  target: unknown,
  metadata: { alias: string; namespace: string },
): asserts target is string {
  const exactTarget = isExactPackageTarget(target)
  const validMetadata = isCanonicalApiMetadata(metadata)
  const wildcardApi = key.includes('*') || (validMetadata && metadata.alias.includes('*'))
  if (!exactTarget || !validMetadata || wildcardApi) {
    UserInput.fail(`Public APIs require exact file exports and canonical namespace metadata: ${filename} ${key}`)
  }
}

function isExactPackageTarget(target: unknown): boolean {
  if (typeof target !== 'string' || !target.startsWith('./')) {
    return false
  }
  return !target.includes('*') && !target.includes('../')
}

function isCanonicalApiMetadata(metadata: { alias: string; namespace: string }): boolean {
  if (metadata === null || typeof metadata !== 'object') {
    return false
  }
  return typeof metadata.alias === 'string' && typeof metadata.namespace === 'string'
}

function requirePublicApiFile(api: PackageApi): void {
  if (!FS.existsSync(api.filename) || !FS.statSync(api.filename).isFile()) {
    UserInput.fail(`Public API must point to an existing file: ${api.alias} -> ${api.filename}`)
  }
}

function haveEqualCompilerPaths(actual: CompilerPaths, expected: CompilerPaths): boolean {
  const keys = Object.keys(expected)
  return Object.keys(actual).length === keys.length
    && keys.every(key => actual[key]?.length === expected[key].length && actual[key][0] === expected[key][0])
}

function dynamicNamespaceIssue(node: TypeScript.Node, namespaces: PackageImportRules): string | undefined {
  if (!TypeScript.isCallExpression(node) || node.expression.kind !== TypeScript.SyntaxKind.ImportKeyword) {
    return
  }
  const specifier = node.arguments[0]
  if (specifier === undefined || !TypeScript.isStringLiteral(specifier)) {
    return
  }
  const canonical = namespaces.get(specifier.text)?.namespace
  if (canonical === undefined) {
    return
  }
  const awaited = node.parent
  const declaration = TypeScript.isAwaitExpression(awaited) ? awaited.parent : undefined
  if (declaration !== undefined && TypeScript.isVariableDeclaration(declaration)) {
    if (TypeScript.isIdentifier(declaration.name) && declaration.name.text === canonical) {
      return
    }
  }
  return `bind dynamic public imports to canonical namespace ${canonical}`
}

function isPrimaryEntity(name: string, rule: PackageImportRule): boolean {
  return name === rule.namespace || rule.entities?.includes(name) === true
}
