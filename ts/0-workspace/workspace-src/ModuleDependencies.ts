import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import { Json, Sort, UserInput } from '@shared'
import Exec from '@shared/os/exec'

import { Errors, Lists, NewlineCharacter, Range, Regxs, Source, Try } from '@shared'
import { Files, FS, Path, Storage, Text } from '@shared/os'
import { valid } from './bridges/Bridge_semver'
import { readProjectRequirements } from './dependencies/Requirements'
import { isNpmRequirement } from './ModuleRequirements'
import { findNamedPackageDirectories, listRecursiveSourceFiles } from './modules/Catalog'
import { isNpmPackageName } from './NpmPackageName'
import { acquireSession, type ProjectSession } from './projects/Sessions'

/** AddModuleNpmDependencyResult identifies the exact package pin written to a Tao module. */
export type AddModuleNpmDependencyResult = {
  moduleRoot: string
  sourcePath: string
  packageName: string
  version: string
}

type NpmVersionExecutor = (packageName: string, cwd: string) => Promise<string>
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
      UserInput.Fail(`Preparation entry must belong to ${projectRoot}: ${path}`)
    }
    return path
  }
  const sources = (await Files.walk(projectRoot)).filter(path => path.endsWith('.tao'))
  const apps = await findAppSources(sources)
  if (apps.length === 1) {
    return apps[0]!
  }
  if (apps.length > 1) {
    UserInput.Fail(`Multiple Tao app entries found; specify one: ${apps.join(', ')}`)
  }
  const rootSources = sources.filter(path => Path.dirname(path) === projectRoot)
  if (rootSources.length === 1) {
    return rootSources[0]!
  }
  UserInput.Fail(`No unique Tao app entry was found; run tao setup <entry>.`)
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
    const source = await FS.readFile(path, 'utf8')
    const document = AST.transform(parser.parse(source))
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
  return Lists.unique(work).sort(Sort.CompareStrings)
}

type DependencySessionId = string | undefined
/** withDependencySession holds the standard CLI project lock for one dependency command. */
export async function withDependencySession<T>(
  projectRoot: string,
  sessionId: DependencySessionId,
  action: (session: ProjectSession) => Promise<T>,
): Promise<T> {
  const identity = `project:${Path.resolve(projectRoot)}:session:${sessionId ?? '.cli'}`
  const session = await acquireSession(projectRoot, { id: sessionId, kind: 'cli' })
  const releaseLease = await Try(() => Storage.acquireCacheLease(identity), {
    catch(error) {
      session.release()
      return Errors.Throw(error)
    },
  })
  return await Try(() => action(session), {
    finally: () => Try(releaseLease, { finally: () => session.release() }),
  })
}

type NpmRequirementOccurrence = { path: string; source: string; range: Range; alias?: string }

async function findAppSources(sources: string[]): Promise<string[]> {
  const candidates = await Promise.all(sources.map(findAppSource))
  return candidates.filter((path): path is string => path !== undefined)
}

async function findAppSource(path: string): Promise<string | undefined> {
  return await containsApp(path) ? path : undefined
}

async function containsApp(path: string): Promise<boolean> {
  const document = AST.transform(parser.parse(await FS.readFile(path, 'utf8')))
  return document ? AST.HasAppDeclarations(document) : false
}

// resolveNpmVersion asks Bun for the registry's current exact version.
async function resolveNpmVersion(packageName: string, cwd: string): Promise<string> {
  const addEnv = { BUN_INSTALL_CACHE_DIR: Storage.resolveCacheDirectory('bun') }
  const result = await Exec.capture('bun', ['info', packageName, 'version', '--json'], { check: false, cwd, addEnv })
  if (result.status !== 0 || result.signal !== null) {
    UserInput.Fail(`Could not resolve ${packageName} with bun info: ${result.stderr.trim()}`)
  }
  const value = Try.WithDefault(undefined, () => parseNpmVersionResponse(result.stdout.trim()))
  const version = resolveNpmVersionValue(value)
  if (!version) {
    UserInput.Fail(`Bun returned no exact version for ${packageName}.`)
  }
  return version
}

function parseNpmVersionResponse(contents: string): unknown {
  return Json.Parse(contents) as unknown
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
  return typeof value === 'object' && value !== null && hasStringVersion(value)
}

function hasStringVersion(value: object): value is { version: string } {
  return 'version' in value && typeof value.version === 'string'
}

async function resolveModule(projectRoot: string, moduleName: string): Promise<string> {
  if (!Regxs.ModuleNameRegx.test(moduleName)) {
    UserInput.Fail(`Expected a local Tao module name such as @widgets; received ${moduleName}.`)
  }
  const matches = await findNamedPackageDirectories(projectRoot, moduleName)
  if (matches.length === 0) {
    UserInput.Fail(`No project-owned module ${moduleName} was found in ${projectRoot}.`)
  }
  if (matches.length > 1) {
    UserInput.Fail(`Module ${moduleName} is ambiguous: ${matches.join(', ')}`)
  }
  return matches[0]!
}

function parsePackageSpec(spec: string): { packageName: string; version?: string } {
  // ex: @x/foo@1.2.3 -> packageName @x/foo, version 1.2.3
  const index = spec.lastIndexOf('@')
  const packageName = index > 0 ? spec.slice(0, index) : spec
  const version = index > 0 ? spec.slice(index + 1) : undefined
  if (!isNpmPackageName(packageName)) {
    UserInput.Fail(`Invalid npm package name: ${packageName}`)
  }
  if (version) {
    validateExactVersion(version)
  }
  return { packageName, ...(version ? { version } : {}) }
}

function validateExactVersion(version: string): void {
  if (valid(version) !== version) {
    UserInput.Fail(`Expected an exact semantic version; received ${version}.`)
  }
}

async function writeRequirement(
  moduleRoot: string,
  projectRoot: string,
  packageName: string,
  version: string,
): Promise<string> {
  const files = await listRecursiveSourceFiles(moduleRoot, moduleRoot, projectRoot)
  const sourceFiles = await readModuleSources(files)
  const occurrences = findNpmRequirementOccurrences(sourceFiles, packageName)
  if (occurrences.length > 0) {
    await replaceRequirements(occurrences, packageName, version)
    return occurrences[0]!.path
  }
  const sourcePath = Path.join(moduleRoot, 'Dependencies.tao')
  const existing = await Try.WithDefault('', () => FS.readFile(sourcePath, 'utf8'))
  await FS.writeFile(
    sourcePath,
    `${existing}${
      existing && !existing.endsWith(NewlineCharacter) ? NewlineCharacter : ''
    }requires npm:${packageName} version ${version}${NewlineCharacter}`,
  )
  return sourcePath
}

type ModuleSourceFile = { path: string; source: string }

async function readModuleSources(paths: string[]): Promise<ModuleSourceFile[]> {
  return await Promise.all(paths.map(readModuleSource))
}

async function readModuleSource(path: string): Promise<ModuleSourceFile> {
  const source = await FS.readFile(path, 'utf8')
  return { path, source }
}

function findNpmRequirementOccurrences(
  sourceFiles: ModuleSourceFile[],
  packageName: string,
): NpmRequirementOccurrence[] {
  return sourceFiles.flatMap(file => collectNpmRequirementSpans(file.path, file.source, packageName))
}

function collectNpmRequirementSpans(
  path: string,
  source: string,
  packageName: string,
): NpmRequirementOccurrence[] {
  const document = AST.transform(parser.parse(source))
  if (!document) {
    UserInput.Fail(`Cannot add a requirement to invalid Tao source: ${path}`)
  }
  return AST.GetDeclarations(document).flatMap(declaration => {
    if (!isNpmRequirement(declaration) || declaration.identifier !== packageName) {
      return []
    }
    const aliasFields = declaration.alias ? { alias: declaration.alias.value } : {}
    return [{
      path,
      source,
      range: declaration.range,
      ...aliasFields,
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
    let bytes = Text.encodeUtf8(values[0]!.source)
    for (const item of values.sort((left, right) => Source.compareByRange(right, left))) {
      const replacement = Text.encodeUtf8(
        `requires npm:${packageName} version ${version}${item.alias ? ` as ${item.alias}` : ''}`,
      )
      bytes = joinBytes(bytes.slice(0, item.range.start), replacement, bytes.slice(item.range.end))
    }
    await FS.writeFile(path, Text.decodeUtf8(bytes))
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
    && path.endsWith('.tao') && await FS.exists(path)
}

const parser = Grammar.createParser()
