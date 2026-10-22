import { Errors, Try } from '@shared'
import { Files, FileSystem, Path, Platform } from '@shared/os'
import { withManagedModuleLock } from './ManagedModuleLock'
import { linkModulePackages, validateModuleLinks, validateModuleOwnership } from './ManagedModuleOwnership'
import type { ManagedModuleOwner } from './ManagedModuleOwnership'
import type { ManagedModuleRequirement, ManagedModulesInput, PreparedManagedModules } from './ManagedModuleTypes'

/** inspectGeneratedModuleFiles reports drift in generated module manifests, configs, and resolution links. */
export async function inspectGeneratedModuleFiles(
  input: ManagedModulesInput,
  managed: PreparedManagedModules,
): Promise<{ path: string; owner: string; repair: string }[]> {
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
  requirements: ManagedModuleRequirement[],
  runtimePins: Record<string, string>,
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
  const path = resolveTypeScriptDefaultsPath(projectRoot)
  const marker = `${path}.tao-managed`
  rejectSymlink(path)
  rejectSymlink(marker)
  const owned = await Try.WithDefault(undefined, () => FileSystem.readFile(marker, 'utf8'))
  const current = await Try.WithDefault(undefined, () => FileSystem.readFile(path, 'utf8'))
  if (current !== undefined && owned !== 'managed-by-tao\n') {
    Errors.ThrowUserInput(`TypeScript defaults are already owned: ${path}`)
  }
  if (owned !== undefined && owned !== 'managed-by-tao\n') {
    Errors.ThrowUserInput(`TypeScript defaults ownership marker is invalid: ${marker}`)
  }
  if (owned === undefined) {
    await Files.writeReadOnly(marker, 'managed-by-tao\n')
  }
  if (current !== typeScriptDefaults) {
    await Files.writeReadOnly(path, typeScriptDefaults)
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
  return Platform.hashText(typeScriptDefaults)
}

/** typescriptDefaultsDrift reports missing or changed shared compiler defaults. */
export async function typescriptDefaultsDrift(
  projectRoot: string,
): Promise<{ path: string; owner: string; repair: string }[]> {
  const path = resolveTypeScriptDefaultsPath(projectRoot)
  const marker = `${path}.tao-managed`
  rejectSymlink(path)
  rejectSymlink(marker)
  const current = await Try.WithDefault(undefined, () => FileSystem.readFile(path, 'utf8'))
  const ownership = await Try.WithDefault(undefined, () => FileSystem.readFile(marker, 'utf8'))
  return current === typeScriptDefaults && ownership === 'managed-by-tao\n'
    ? []
    : [{
      path: current === typeScriptDefaults ? marker : path,
      owner: 'project runtime policy',
      repair: 'tao setup --repair',
    }]
}

// resolveTypeScriptDefaultsPath returns the shared generated compiler configuration path.
function resolveTypeScriptDefaultsPath(projectRoot: string): string {
  return Path.join(projectRoot, '.tao', 'cache', 'sidecars', 'typescript-defaults.json')
}

function createModuleTypeScriptConfig(moduleDirectory: string, defaultsPath: string): string {
  const relative = Path.relative(moduleDirectory, defaultsPath).replaceAll('\\', '/')
  const extendsPath = relative.startsWith('.') ? relative : `./${relative}`
  return `${JSON.stringify({ extends: extendsPath, include: ['**/*.ts', '**/*.tsx'] }, null, 2)}\n`
}

async function moduleDrift(
  directory: string,
  requirements: ManagedModuleRequirement[],
  runtimePins: Record<string, string>,
  projectRoot: string,
  managed: PreparedManagedModules,
): Promise<{ path: string; owner: string; repair: string }[]> {
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
  const drift = [] as { path: string; owner: string; repair: string }[]
  for (const [path, expected] of files) {
    if (!await FileSystem.exists(path) || await FileSystem.readFile(path, 'utf8') !== expected) {
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
  if (!await FileSystem.exists(path) || !await FileSystem.exists(expected)) {
    return false
  }
  return Try.WithDefault(false, () => FileSystem.realpathSync(path) === FileSystem.realpathSync(expected))
}

async function repairModuleFiles(
  directory: string,
  profile: string,
  requirements: ManagedModuleRequirement[],
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
  const owner = await Try.WithDefault(undefined, () => FileSystem.readFile(marker, 'utf8'))
  const expectedOwner = createModuleOwnerMarker(files, requirements, profile)
  const previousOwner = await validateModuleOwnership(
    owner,
    marker,
    profile,
    projectRoot,
    files,
    expectedOwner,
    repair,
  )
  await validateModuleLinks(directory, profile, requirements.map(({ name }) => name), previousOwner)
  for (const [path] of files) {
    if (await FileSystem.exists(path) && owner !== expectedOwner) {
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

function createModuleManifest(dependencies: Record<string, string>): string {
  return `${JSON.stringify({ private: true, type: 'module', dependencies }, null, 2)}\n`
}

function cannotReplaceModuleFile(
  previousOwner: ManagedModuleOwner | undefined,
  repair: boolean,
  profile: string,
): boolean {
  return previousOwner === undefined || (!repair && previousOwner.profile === profile)
}

function createModuleOwnerMarker(
  files: readonly (readonly [string, string])[],
  requirements: ManagedModuleRequirement[],
  profile: string,
): string {
  return `${
    JSON.stringify(
      {
        files: files.map(([path]) => path),
        generatedHashes: Object.fromEntries(files.map(([path, contents]) => [path, Platform.hashText(contents)])),
        packages: requirements.map(({ name }) => name),
        profile,
        ignoreBlock: createModuleIgnoreBlock(),
      },
      null,
      2,
    )
  }\n`
}

async function moduleIgnoreDrift(directory: string): Promise<boolean> {
  const content = await Try.WithDefault(
    undefined,
    () => FileSystem.readFile(Path.join(directory, '.gitignore'), 'utf8'),
  )
  return content === undefined || !content.includes(createModuleIgnoreBlock())
}

async function ensureModuleIgnore(directory: string, owned: boolean): Promise<void> {
  const path = Path.join(directory, '.gitignore')
  rejectSymlink(path)
  const current = await Try.WithDefault('', () => FileSystem.readFile(path, 'utf8'))
  const block = createModuleIgnoreBlock()
  if (current.includes(block)) {
    return
  }
  const start = current.indexOf('# tao-managed-sidecars:begin')
  if (start >= 0) {
    if (!owned || start !== current.lastIndexOf('# tao-managed-sidecars:begin')) {
      Errors.ThrowUserInput(`Module ignore block is already present without Tao ownership: ${path}`)
    }
    const end = current.indexOf('# tao-managed-sidecars:end\n', start)
    if (end < start || end !== current.lastIndexOf('# tao-managed-sidecars:end\n')) {
      Errors.ThrowUserInput(`Module ignore block is invalid: ${path}`)
    }
    const endExclusive = end + '# tao-managed-sidecars:end\n'.length
    await writeModuleIgnore(path, `${current.slice(0, start)}${block}${current.slice(endExclusive)}`)
    return
  }
  const next = `${current}${current.length > 0 && !current.endsWith('\n') ? '\n' : ''}${block}`
  await writeModuleIgnore(path, next)
}

async function writeModuleIgnore(path: string, contents: string): Promise<void> {
  if (await FileSystem.exists(path)) {
    await Files.withWritableFile(path, file => file.write(contents))
  } else {
    await FileSystem.writeFile(path, contents)
  }
}

function createModuleIgnoreBlock(): string {
  return '# tao-managed-sidecars:begin\n/package.json\n/tsconfig.json\n/node_modules/\n/.tao-managed-module.json\n/.tao-*.contract.ts\n/.tao-*.contract.ts.tao-managed\n# tao-managed-sidecars:end\n'
}

function rejectSymlink(path: string): void {
  if (Try.WithDefault(false, () => FileSystem.lstatSync(path).isSymbolicLink())) {
    Errors.ThrowUserInput(`Generated module metadata cannot be a symbolic link: ${path}`)
  }
}

const typeScriptDefaults = `${
  JSON.stringify(
    {
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
      },
    },
    null,
    2,
  )
}\n`
