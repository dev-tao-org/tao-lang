import * as Runtime from '@runtime'
import { Json } from '@shared'
import { Errors, NewlineCharacter, Try } from '@shared'
import * as Shared from '@shared'
import { Files, FS, Path, Platform } from '@shared/os'
import { withManagedModuleLock } from './ManagedModuleLock'
import type { ManagedModuleOwner } from './ManagedModuleOwnership'
import { linkModulePackages, validateModuleLinks, validateModuleOwnership } from './ManagedModuleOwnership'
import type * as ManagedTypes from './ManagedModuleTypes'

type ManagedFileContents = string | undefined
type PreviousModuleOwner = ManagedModuleOwner | undefined

/** inspectGeneratedModuleFiles reports drift in generated module manifests, configs, and resolution links. */
export async function inspectGeneratedModuleFiles(
  input: ManagedTypes.ManagedModulesInput,
  managed: ManagedTypes.PreparedManagedModules,
): Promise<ManagedTypes.GeneratedModuleFileDrift[]> {
  const drift = await typescriptDefaultsDrift(input.directory)
  if (drift.length > 0) {
    return drift
  }
  for (const module of input.modules) {
    drift.push(...await moduleDrift(module.directory, module.requirements, input.runtimePins, input.directory, managed))
  }
  return drift
}

/** publishModuleResolution writes owned module metadata and links packages to the shared app profile. */
export function publishModuleResolution(
  directory: string,
  profile: string,
  requirements: ManagedTypes.ManagedModuleRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
  projectRoot: string,
  repair = false,
): Promise<void> {
  return withManagedModuleLock(directory, async () => {
    const merged = { ...runtimePins, ...Object.fromEntries(requirements.map(({ name, version }) => [name, version])) }
    const localRequirements = Object.entries(merged).map(([name, version]) => ({ name, version, origin: 'runtime' }))
    const previousOwner = await repairModuleFiles(
      directory,
      profile,
      localRequirements,
      resolveTypeScriptDefaultsPath(projectRoot),
      projectRoot,
      repair,
    )
    await linkModulePackages(directory, profile, Object.keys(merged), previousOwner)
  })
}

/** ensureTypeScriptDefaults creates the project-shared immutable compiler configuration. */
export async function ensureTypeScriptDefaults(projectRoot: string): Promise<void> {
  const defaults = createTypeScriptDefaults()
  const path = resolveTypeScriptDefaultsPath(projectRoot)
  const marker = `${path}.tao-managed`
  rejectSymlink(path)
  rejectSymlink(marker)
  const owned = await Try.WithDefault(undefined, () => FS.readFile(marker, 'utf8'))
  const current = await Try.WithDefault(undefined, () => FS.readFile(path, 'utf8'))
  if (current !== undefined && owned !== ('managed-by-tao' + NewlineCharacter)) {
    Errors.ThrowUserInput(`TypeScript defaults are already owned: ${path}`)
  }
  if (owned !== undefined && owned !== ('managed-by-tao' + NewlineCharacter)) {
    Errors.ThrowUserInput(`TypeScript defaults ownership marker is invalid: ${marker}`)
  }
  if (owned === undefined) {
    await Files.writeReadOnly(marker, 'managed-by-tao' + NewlineCharacter)
  }
  if (current !== defaults) {
    await Files.writeReadOnly(path, defaults)
  }
}

/** validateTypeScriptDefaults rejects changed compiler defaults before invoking module tools. */
export async function validateTypeScriptDefaults(projectRoot: string): Promise<void> {
  if (await typescriptDefaultsDrift(projectRoot).then(items => items.length > 0)) {
    Errors.ThrowUserInput(`TypeScript defaults drifted. Repair with: tao setup --repair.`)
  }
}

/** typeScriptDefaultsHash fingerprints the compiler settings shared by every Tao module. */
export function typeScriptDefaultsHash(): string {
  return Platform.hashText(createTypeScriptDefaults())
}

/** typescriptDefaultsDrift reports missing or changed shared compiler defaults. */
export async function typescriptDefaultsDrift(projectRoot: string): Promise<ManagedTypes.GeneratedModuleFileDrift[]> {
  const defaults = createTypeScriptDefaults()
  const path = resolveTypeScriptDefaultsPath(projectRoot)
  const marker = `${path}.tao-managed`
  rejectSymlink(path)
  rejectSymlink(marker)
  const current = await Try.WithDefault(undefined, () => FS.readFile(path, 'utf8'))
  const ownership = await Try.WithDefault(undefined, () => FS.readFile(marker, 'utf8'))
  return createTypeScriptDefaultsDrift(current, ownership, defaults, path, marker)
}

function createTypeScriptDefaultsDrift(
  current: ManagedFileContents,
  ownership: ManagedFileContents,
  defaults: string,
  path: string,
  marker: string,
): ManagedTypes.GeneratedModuleFileDrift[] {
  if (current === defaults && ownership === ('managed-by-tao' + NewlineCharacter)) {
    return []
  }
  let driftPath = path
  if (current === defaults) {
    driftPath = marker
  }
  return [{ path: driftPath, owner: 'project runtime policy', repair: 'tao setup --repair' }]
}

// resolveTypeScriptDefaultsPath returns the shared generated compiler configuration path.
function resolveTypeScriptDefaultsPath(projectRoot: string): string {
  return Path.join(projectRoot, '.tao', 'cache', 'sidecars', 'typescript-defaults.json')
}

function createModuleTypeScriptConfig(moduleDirectory: string, defaultsPath: string): string {
  const extendsPath = Path.toRelativeModuleSpecifier(Path.relative(moduleDirectory, defaultsPath))
  return `${
    Json.Print({
      extends: extendsPath,
      compilerOptions: { baseUrl: '.' },
      include: ['**/*.ts', '**/*.tsx'],
    })
  }${NewlineCharacter}`
}

async function moduleDrift(
  directory: string,
  requirements: ManagedTypes.ManagedModuleRequirement[],
  runtimePins: ManagedTypes.ManagedRuntimePins,
  projectRoot: string,
  managed: ManagedTypes.PreparedManagedModules,
): Promise<ManagedTypes.GeneratedModuleFileDrift[]> {
  const merged = { ...runtimePins, ...Object.fromEntries(requirements.map(({ name, version }) => [name, version])) }
  const files = [
    [
      Path.join(directory, 'package.json'),
      createModuleManifest(merged),
    ],
    [
      Path.join(directory, 'tsconfig.json'),
      createModuleTypeScriptConfig(directory, resolveTypeScriptDefaultsPath(projectRoot)),
    ],
  ] as const
  const drift: ManagedTypes.GeneratedModuleFileDrift[] = []
  for (const [path, expected] of files) {
    if (!await FS.exists(path) || await FS.readFile(path, 'utf8') !== expected) {
      drift.push({ path, owner: requirements[0]?.origin ?? 'runtime policy', repair: 'tao setup --repair' })
    }
  }
  for (const name of Object.keys(merged)) {
    const path = Path.join(directory, 'node_modules', name)
    const expected = Path.join(managed.packageDirectory, 'node_modules', name)
    if (!await moduleLinkMatches(path, expected)) {
      drift.push({
        path,
        owner: requirements.find(item => item.name === name)?.origin ?? 'runtime policy',
        repair: 'tao setup --repair',
      })
    }
  }
  if (await moduleIgnoreDrift(directory)) {
    drift.push({
      path: Path.join(directory, '.gitignore'),
      owner: requirements[0]?.origin ?? 'runtime policy',
      repair: 'tao setup --repair',
    })
  }
  return drift
}

async function moduleLinkMatches(path: string, expected: string): Promise<boolean> {
  if (!await FS.exists(path) || !await FS.exists(expected)) {
    return false
  }
  return Try.WithDefault(false, () => FS.realpathSync(path) === FS.realpathSync(expected))
}

async function repairModuleFiles(
  directory: string,
  profile: string,
  requirements: ManagedTypes.ManagedModuleRequirement[],
  defaultsPath: string,
  projectRoot: string,
  repair: boolean,
): Promise<ManagedModuleOwner | undefined> {
  const dependencies = Object.fromEntries(requirements.map(({ name, version }) => [name, version]))
  const files = [
    [Path.join(directory, 'package.json'), createModuleManifest(dependencies)],
    [Path.join(directory, 'tsconfig.json'), createModuleTypeScriptConfig(directory, defaultsPath)],
  ] as const
  const marker = Path.join(directory, '.tao-managed-module.json')
  rejectSymlink(marker)
  const owner = await Try.WithDefault(undefined, () => FS.readFile(marker, 'utf8'))
  const expectedOwner = createModuleOwnerMarker(files, requirements, profile)
  const previousOwner = await validateModuleOwnership(owner, marker, profile, projectRoot, files, expectedOwner, repair)
  await validateModuleLinks(directory, profile, requirements.map(({ name }) => name), previousOwner)
  for (const [path] of files) {
    if (await FS.exists(path) && owner !== expectedOwner) {
      const corruptMarkerRecovery = repair && owner !== undefined && previousOwner === undefined
      if (!corruptMarkerRecovery && cannotReplaceModuleFile(previousOwner, repair, profile)) {
        Errors.ThrowUserInput(`Module metadata is already owned: ${path}`)
      }
    }
  }
  for (const [path, contents] of files) {
    await Files.writeReadOnly(path, contents)
  }
  if (owner !== expectedOwner) {
    await Files.writeReadOnly(marker, expectedOwner)
  }
  await ensureModuleIgnore(directory, owner !== undefined)
  return previousOwner
}

function createModuleManifest(dependencies: ManagedTypes.ManagedPackageVersionMap): string {
  return `${Json.Print({ private: true, type: 'module', dependencies })}${NewlineCharacter}`
}

function cannotReplaceModuleFile(
  previousOwner: PreviousModuleOwner,
  repair: boolean,
  profile: string,
): boolean {
  return previousOwner === undefined || (!repair && previousOwner.profile === profile)
}

function createModuleOwnerMarker(
  files: readonly (readonly [string, string])[],
  requirements: ManagedTypes.ManagedModuleRequirement[],
  profile: string,
): string {
  return `${
    Json.Print({
      files: files.map(([path]) => path),
      generatedHashes: Object.fromEntries(files.map(([path, contents]) => [path, Platform.hashText(contents)])),
      packages: requirements.map(({ name }) => name),
      profile,
      ignoreBlock: createModuleIgnoreBlock(),
    })
  }${NewlineCharacter}`
}

async function moduleIgnoreDrift(directory: string): Promise<boolean> {
  const content = await Try.WithDefault(
    undefined,
    () => FS.readFile(Path.join(directory, '.gitignore'), 'utf8'),
  )
  return content === undefined || !content.includes(createModuleIgnoreBlock())
}

async function ensureModuleIgnore(directory: string, owned: boolean): Promise<void> {
  const path = Path.join(directory, '.gitignore')
  rejectSymlink(path)
  const current = await Try.WithDefault('', () => FS.readFile(path, 'utf8'))
  const block = createModuleIgnoreBlock()
  if (current.includes(block)) {
    return
  }
  const start = current.indexOf('# tao-managed-sidecars:begin')
  if (start >= 0) {
    if (!owned || start !== current.lastIndexOf('# tao-managed-sidecars:begin')) {
      Errors.ThrowUserInput(`Module ignore block is already present without Tao ownership: ${path}`)
    }
    const end = current.indexOf('# tao-managed-sidecars:end' + NewlineCharacter, start)
    if (end < start || end !== current.lastIndexOf('# tao-managed-sidecars:end' + NewlineCharacter)) {
      Errors.ThrowUserInput(`Module ignore block is invalid: ${path}`)
    }
    const endExclusive = end + ('# tao-managed-sidecars:end' + NewlineCharacter).length
    await writeModuleIgnore(path, `${current.slice(0, start)}${block}${current.slice(endExclusive)}`)
    return
  }
  const next = `${current}${current.length > 0 && !current.endsWith(NewlineCharacter) ? NewlineCharacter : ''}${block}`
  await writeModuleIgnore(path, next)
}

async function writeModuleIgnore(path: string, contents: string): Promise<void> {
  if (await FS.exists(path)) {
    await Files.withWritableFile(path, file => file.write(contents))
  } else {
    await FS.writeFile(path, contents)
  }
}

function createModuleIgnoreBlock(): string {
  return Shared.joinTextLines(
    '# tao-managed-sidecars:begin',
    '/package.json',
    '/tsconfig.json',
    '/node_modules/',
    '/.tao-managed-module.json',
    '/.tao-*.contract.ts',
    '/.tao-*.contract.ts.tao-managed',
    '# tao-managed-sidecars:end',
    '',
  )
}

function rejectSymlink(path: string): void {
  if (Try.WithDefault(false, () => FS.lstatSync(path).isSymbolicLink())) {
    Errors.ThrowUserInput(`Generated module metadata cannot be a symbolic link: ${path}`)
  }
}

/** createTypeScriptDefaults shares authored defaults with generation-pinned snapshot validation. */
export function createTypeScriptDefaults(resourcesDirectory?: string): string {
  return `${
    Json.Print({
      compilerOptions: {
        moduleResolution: 'Bundler',
        module: 'ESNext',
        target: 'ES2022',
        strict: true,
        noEmit: true,
        jsx: 'react-jsx',
        skipLibCheck: true,
        resolveJsonModule: true,
        allowImportingTsExtensions: true,
        lib: ['ES2022', 'DOM'],
        paths: {
          ...Runtime.runtimeTypeScriptPaths(resourcesDirectory),
          'zod': ['node_modules/zod'],
          'zod/*': ['node_modules/zod/*'],
          'react': ['node_modules/@types/react'],
          'react/*': ['node_modules/@types/react/*'],
          'react-native': ['node_modules/react-native'],
          'react-native/*': ['node_modules/react-native/*'],
          '@preact/signals-core': ['node_modules/@preact/signals-core'],
        },
      },
    })
  }${NewlineCharacter}`
}
