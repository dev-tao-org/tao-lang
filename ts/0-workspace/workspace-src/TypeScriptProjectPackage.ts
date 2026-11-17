import type * as Runtime from '@runtime'
import { Json } from '@shared'
import { Errors } from '@shared'
import { FS, Path } from '@shared/os'

/** TypeScriptProjectPackage retains authored dependency and Tao configuration at its package directory. */
export type TypeScriptProjectPackage = {
  directory: string
  name: string
  dependencies: Runtime.RuntimePackageVersions
  devDependencies: Runtime.RuntimePackageVersions
  compile?: PackageCompileConfiguration
  run?: PackageRunConfiguration
}

type PackageCompileConfiguration = { entry: string; name?: string }
type PackageRunConfiguration = { entry: string; name: string }

type PackageRecord = Record<string, unknown>

/** readTypeScriptProjectPackage reads one explicitly selected authored package without installing dependencies. */
export async function readTypeScriptProjectPackage(directory: string): Promise<TypeScriptProjectPackage> {
  const root = Path.resolve(directory)
  const path = Path.join(root, 'package.json')
  if (!FS.existsSync(path)) {
    return Errors.ThrowUserInput(`No package.json at ${root}; select the authored TypeScript package with --package.`)
  }
  return parseTypeScriptProjectPackage(await FS.readFile(path, 'utf8'), root)
}

function parseTypeScriptProjectPackage(source: string, directory: string): TypeScriptProjectPackage {
  const value: unknown = Json.Parse(source)
  const manifest = requirePackageRecord(value, 'package.json')
  const name = requireString(manifest.name, 'package.json name')
  const tao = manifest.tao === undefined ? {} : requirePackageRecord(manifest.tao, 'tao')
  return {
    directory,
    name,
    dependencies: readPackageVersions(manifest.dependencies),
    devDependencies: readPackageVersions(manifest.devDependencies),
    compile: tao.compile === undefined ? undefined : readCompileConfiguration(tao.compile),
    run: tao.run === undefined ? undefined : readRunConfiguration(tao.run, name),
  }
}

function readCompileConfiguration(value: unknown): PackageCompileConfiguration {
  const configuration = requirePackageRecord(value, 'tao.compile')
  if (configuration.out !== undefined) {
    Errors.ThrowUserInput('Remove tao.compile.out; build output is owned by the selected session.')
  }
  return {
    entry: requireString(configuration.entry, 'tao.compile.entry'),
    name: readOptionalString(configuration.name, 'tao.compile.name'),
  }
}

function readRunConfiguration(value: unknown, name: string): PackageRunConfiguration {
  const configuration = requirePackageRecord(value, 'tao.run')
  return {
    entry: requireString(configuration.entry, 'tao.run.entry'),
    name: readOptionalString(configuration.name, 'tao.run.name') ?? name,
  }
}

function requirePackageRecord(value: unknown, field: string): PackageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Errors.ThrowUserInput(`${field} must be an object.`)
  }
  return value as PackageRecord
}

function readPackageVersions(value: unknown): Runtime.RuntimePackageVersions {
  if (value === undefined) {
    return {}
  }
  const versions = requirePackageRecord(value, 'Package dependencies')
  return Object.fromEntries(Object.entries(versions).map(([name, version]) => [name, requireString(version, name)]))
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) {
    return Errors.ThrowUserInput(`${field} must be a non-empty string.`)
  }
  return value
}

function readOptionalString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requireString(value, field)
}
