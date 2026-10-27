import * as AST from '@ast-gen/AST'
import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Errors, Range, Try } from '@shared'
import { Env, Files, FileSystem, Path, Platform, Storage } from '@shared/os'
import { valid } from 'semver'
import { readProjectRequirements } from './dependencies/Requirements'
import { isNpmRequirement } from './ModuleRequirements'
import { findNamedPackageDirectories, listRecursiveSourceFiles } from './modules/Catalog'
import { isNpmPackageName } from './NpmPackageName'
import { acquireSession } from './projects/Sessions'

/** AddModuleNpmDependencyResult identifies the exact package pin written to a Tao module. */
export type AddModuleNpmDependencyResult = {
  moduleRoot: string
  sourcePath: string
  packageName: string
  version: string
}

/** addModuleNpmDependency writes an exact npm pin into one project-owned named module. */
export async function addModuleNpmDependency(
  projectRoot: string,
  moduleName: string,
  packageSpec: string,
  executor: NpmVersionExecutor = resolveNpmVersion,
): Promise<AddModuleNpmDependencyResult> {
  const moduleRoot = await resolveModule(projectRoot, moduleName)
  const { packageName, version: requested } = parsePackageSpec(packageSpec)
  const version = requested ?? await executor(packageName, projectRoot)
  validateExactVersion(version)
  const sourcePath = await writeRequirement(moduleRoot, projectRoot, packageName, version)
  return { moduleRoot, sourcePath, packageName, version }
}

/** findPreparationEntry selects an explicit source or an unambiguous app/project source. */
export async function findPreparationEntry(projectRoot: string, requested?: string): Promise<string> {
  if (requested) {
    const path = Path.resolve(requested)
    if (!await sourceIsInsideProject(path, projectRoot)) {
      Errors.ThrowUserInput(`Preparation entry must belong to ${projectRoot}: ${path}`)
    }
    return path
  }
  const sources = (await Files.walk(projectRoot)).filter(path => path.endsWith('.tao'))
  const apps = (await Promise.all(sources.map(async path => await containsApp(path) ? path : undefined)))
    .filter((path): path is string => path !== undefined)
  if (apps.length === 1) {
    return apps[0]!
  }
  if (apps.length > 1) {
    Errors.ThrowUserInput(`Multiple Tao app entries found; specify one: ${apps.join(', ')}`)
  }
  const rootSources = sources.filter(path => Path.dirname(path) === projectRoot)
  if (rootSources.length === 1) {
    return rootSources[0]!
  }
  Errors.ThrowUserInput(`No unique Tao app entry was found; run tao setup <entry>.`)
}

/** listDependencyWork describes authored source and npm requirements before preparation. */
export async function listDependencyWork(projectRoot: string): Promise<string[]> {
  const work = [
    'bundled app runtime',
    ...(await readProjectRequirements(projectRoot)).map(requirement =>
      `${requirement.provider}:${requirement.identifier}@${requirement.version}`
    ),
  ]
  for (const path of (await Files.walk(projectRoot)).filter(candidate => candidate.endsWith('.tao'))) {
    const source = await FileSystem.readFile(path, 'utf8')
    const document = transform(parser.parse(source))
    if (!document) {
      continue
    }
    for (const declaration of AST.GetDeclarations(document)) {
      if (isNpmRequirement(declaration)) {
        work.push(`npm:${declaration.identifier}${declaration.version ? `@${declaration.version}` : ''}`)
      }
    }
    if (AST.HasForeignViews(document)) {
      work.push(`sidecar:${path}`)
    }
  }
  return [...new Set(work)].sort()
}

/** withDependencySession holds the standard CLI project lock for one dependency command. */
export async function withDependencySession<T>(
  projectRoot: string,
  sessionId: string | undefined,
  action: () => Promise<T>,
  acquireLease: typeof Storage.acquireCacheLease = Storage.acquireCacheLease,
): Promise<T> {
  const identity = `project:${Path.resolve(projectRoot)}:session:${sessionId ?? '.cli'}`
  const session = await acquireSession(projectRoot, { id: sessionId, kind: 'cli' })
  const releaseLease = await Try(() => acquireLease(identity), {
    catch(error) {
      session.release()
      return Errors.Throw(error)
    },
  })
  return await Try(action, {
    finally: () => Try(releaseLease, { finally: () => session.release() }),
  })
}

type NpmVersionExecutor = (packageName: string, cwd: string) => Promise<string>
type NpmRequirementOccurrence = { path: string; source: string; alias?: string } & Range

// resolveNpmVersion asks Bun for the registry's current exact version.
async function resolveNpmVersion(packageName: string, cwd: string): Promise<string> {
  const child = Platform.spawn(['bun', 'info', packageName, 'version', '--json'], {
    cwd,
    env: { ...Env.snapshot(), BUN_INSTALL_CACHE_DIR: Storage.resolveCacheDirectory('bun') },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    child.exited,
    Platform.readText(child.stdout),
    Platform.readText(child.stderr),
  ])
  if (status !== 0) {
    Errors.ThrowUserInput(`Could not resolve ${packageName} with bun info: ${stderr.trim()}`)
  }
  const value = Try.WithDefault(undefined, () => JSON.parse(stdout.trim()) as unknown)
  const version = resolveNpmVersionValue(value)
  if (!version) {
    Errors.ThrowUserInput(`Bun returned no exact version for ${packageName}.`)
  }
  return version
}

function resolveNpmVersionValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (isNpmVersionRecord(value)) {
    return value.version
  }
  return undefined
}

function isNpmVersionRecord(value: unknown): value is { version: string } {
  return typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'string'
}

async function resolveModule(projectRoot: string, moduleName: string): Promise<string> {
  if (!/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(moduleName)) {
    Errors.ThrowUserInput(`Expected a local Tao module name such as @widgets; received ${moduleName}.`)
  }
  const matches = await findNamedPackageDirectories(projectRoot, moduleName)
  if (matches.length === 0) {
    Errors.ThrowUserInput(`No project-owned module ${moduleName} was found in ${projectRoot}.`)
  }
  if (matches.length > 1) {
    Errors.ThrowUserInput(`Module ${moduleName} is ambiguous: ${matches.join(', ')}`)
  }
  return matches[0]!
}

function parsePackageSpec(spec: string): { packageName: string; version?: string } {
  // ex: @x/foo@1.2.3 -> packageName @x/foo, version 1.2.3
  const index = spec.lastIndexOf('@')
  const packageName = index > 0 ? spec.slice(0, index) : spec
  const version = index > 0 ? spec.slice(index + 1) : undefined
  if (!isNpmPackageName(packageName)) {
    Errors.ThrowUserInput(`Invalid npm package name: ${packageName}`)
  }
  if (version) {
    validateExactVersion(version)
  }
  return { packageName, ...(version ? { version } : {}) }
}

function validateExactVersion(version: string): void {
  if (valid(version) !== version) {
    Errors.ThrowUserInput(`Expected an exact semantic version; received ${version}.`)
  }
}

async function writeRequirement(
  moduleRoot: string,
  projectRoot: string,
  packageName: string,
  version: string,
): Promise<string> {
  const files = await listRecursiveSourceFiles(moduleRoot, moduleRoot, projectRoot)
  const occurrences = (await Promise.all(files.map(async path => ({
    path,
    source: await FileSystem.readFile(path, 'utf8'),
  })))).flatMap(file => collectNpmRequirementSpans(file.path, file.source, packageName))
  if (occurrences.length > 0) {
    await replaceRequirements(occurrences, packageName, version)
    return occurrences[0]!.path
  }
  const sourcePath = Path.join(moduleRoot, 'Dependencies.tao')
  const existing = await Try.WithDefault('', () => FileSystem.readFile(sourcePath, 'utf8'))
  await FileSystem.writeFile(
    sourcePath,
    `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}requires npm:${packageName} version ${version}\n`,
  )
  return sourcePath
}

function collectNpmRequirementSpans(
  path: string,
  source: string,
  packageName: string,
): NpmRequirementOccurrence[] {
  const document = transform(parser.parse(source))
  if (!document) {
    Errors.ThrowUserInput(`Cannot add a requirement to invalid Tao source: ${path}`)
  }
  return AST.GetDeclarations(document).flatMap(declaration => {
    if (!isNpmRequirement(declaration) || declaration.identifier !== packageName) {
      return []
    }
    return [{
      path,
      source,
      ...Range(declaration.start, declaration.end),
      ...(declaration.alias ? { alias: declaration.alias.value } : {}),
    }]
  })
}

async function replaceRequirements(
  occurrences: NpmRequirementOccurrence[],
  packageName: string,
  version: string,
): Promise<void> {
  const grouped = new Map<string, typeof occurrences>()
  for (const occurrence of occurrences) {
    grouped.set(occurrence.path, [...(grouped.get(occurrence.path) ?? []), occurrence])
  }
  for (const [path, values] of grouped) {
    let bytes = new TextEncoder().encode(values[0]!.source)
    for (const item of values.sort((left, right) => right.start - left.start)) {
      const replacement = new TextEncoder().encode(
        `requires npm:${packageName} version ${version}${item.alias ? ` as ${item.alias}` : ''}`,
      )
      bytes = joinBytes(bytes.slice(0, item.start), replacement, bytes.slice(item.end))
    }
    await FileSystem.writeFile(path, new TextDecoder().decode(bytes))
  }
}

function joinBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

async function sourceIsInsideProject(path: string, projectRoot: string): Promise<boolean> {
  return Path.isWithin(projectRoot, path)
    && path.endsWith('.tao') && await FileSystem.exists(path)
}

async function containsApp(path: string): Promise<boolean> {
  const document = transform(parser.parse(await FileSystem.readFile(path, 'utf8')))
  return document ? AST.HasAppDeclarations(document) : false
}

const parser = createParser()
