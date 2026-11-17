import { Regxs, UserInput } from '@shared'
import { FS, Path } from '@shared/os'
import { TypeScript } from '@tao/shared/typescript'

type PackageTestManifest = {
  tao?: { publicApi?: Record<string, { namespace: string }>; testInputs?: string[] }
}
type TestOwnership = {
  root: string
  sourceRoot: string
  rootOwner: string
  sourceDirectories: ReadonlySet<string>
  inputDirectories: readonly string[]
}
type TestOwnerMode = { base: boolean; concerns: boolean }
type TestOwnerModes = Map<string, TestOwnerMode>
type TestModule = { owner: string; marker: string; hasConcern: boolean }

/** assertPackageTests checks central, source-folder-owned test and helper module names. */
export function assertPackageTests(manifestFilename: string): void {
  const directory = Path.dirname(manifestFilename)
  const packageName = Path.basename(directory).replace(Regxs.PackageOrderPrefixRegx, '')
  const manifest = TypeScript.readConfigFile(manifestFilename, TypeScript.sys.readFile).config as PackageTestManifest
  const files = TypeScript.sys.readDirectory(directory, ['.ts', '.tsx'], [
    '**/node_modules/**',
    '**/.tao/**',
    '**/_gen_*/**',
  ]).map(normalizePath)
  const ownership = createTestOwnership(directory, packageName, manifest, files)
  const modes: TestOwnerModes = new Map()
  for (const filename of files) {
    if (ownership.inputDirectories.some(input => filename.startsWith(input + '/'))) {
      continue
    }
    const module = readTestModule(filename)
    if (module === undefined) {
      continue
    }
    const owner = requireTestOwner(filename, module, ownership)
    if (module.marker === 'test') {
      requireSingleOwnerMode(owner, module.hasConcern, modes)
    }
  }
}

function createTestOwnership(
  directory: string,
  packageName: string,
  manifest: PackageTestManifest,
  files: readonly string[],
): TestOwnership {
  const root = normalizePath(Path.join(directory, `test-${packageName}`))
  const sourceRoot = normalizePath(Path.join(directory, `${packageName}-src`))
  const rootOwner = manifest.tao?.publicApi?.['.']?.namespace ?? pascalPackageName(packageName)
  const sourceDirectories = collectSourceDirectories(files, sourceRoot)
  const inputDirectories = (manifest.tao?.testInputs ?? []).map(input =>
    requireTestInputDirectory(directory, root, input)
  )
  return { root, sourceRoot, rootOwner, sourceDirectories, inputDirectories }
}

function pascalPackageName(packageName: string): string {
  return packageName.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function collectSourceDirectories(files: readonly string[], sourceRoot: string): ReadonlySet<string> {
  const directories = new Set([sourceRoot])
  for (const filename of files) {
    if (!filename.startsWith(sourceRoot + '/')) {
      continue
    }
    let parent = normalizePath(Path.dirname(filename))
    while (parent.startsWith(sourceRoot + '/')) {
      directories.add(parent)
      parent = normalizePath(Path.dirname(parent))
    }
  }
  return directories
}

function requireTestInputDirectory(directory: string, root: string, input: string): string {
  const resolved = normalizePath(Path.resolve(directory, input))
  const inside = resolved.startsWith(root + '/') && !input.includes('*')
  if (!inside || !FS.existsSync(resolved) || !FS.statSync(resolved).isDirectory()) {
    UserInput.fail(`Test input layouts require an existing exact directory inside ${root}: ${input}`)
  }
  return resolved
}

function readTestModule(filename: string): TestModule | undefined {
  const parts = Path.basename(filename, Path.extname(filename)).split('.')
  const marker = parts.findIndex(part => part === 'test' || part === 'test-utils' || part === 'test-fixtures')
  if (marker < 1) {
    return
  }
  const valid = parts.every(part => part.length > 0) && marker > 0
  const validTest = parts[marker] === 'test' && marker === parts.length - 1
  const validHelper = parts[marker] !== 'test' && marker === 1
  if (!valid || (!validTest && !validHelper)) {
    UserInput.fail(`Use owner[.Concern].test.ts or owner.test-utils/test-fixtures[.Concern].ts: ${filename}`)
  }
  return { owner: parts[0]!, marker: parts[marker]!, hasConcern: marker > 1 }
}

function requireTestOwner(filename: string, module: TestModule, ownership: TestOwnership): string {
  if (!filename.startsWith(ownership.root + '/')) {
    UserInput.fail(`Package tests belong in the central ${ownership.root} root: ${filename}`)
  }
  const parent = normalizePath(Path.relative(ownership.root, Path.dirname(filename)))
  const rootOwner = parent === '' && module.owner === ownership.rootOwner
  const source = rootOwner ? ownership.sourceRoot : normalizePath(Path.join(ownership.sourceRoot, parent, module.owner))
  if (!ownership.sourceDirectories.has(source)) {
    UserInput.fail(`Test modules must name a mirrored source-folder owner: ${filename} -> ${source}`)
  }
  return normalizePath(Path.join(ownership.root, parent, module.owner))
}

function requireSingleOwnerMode(owner: string, hasConcern: boolean, modes: TestOwnerModes): void {
  const current = modes.get(owner) ?? { base: false, concerns: false }
  if (hasConcern) {
    current.concerns = true
  } else {
    current.base = true
  }
  if (current.base && current.concerns) {
    UserInput.fail(`A test folder owner uses one base file or concern files, never both: ${owner}`)
  }
  modes.set(owner, current)
}

function normalizePath(filename: string): string {
  return filename.replaceAll('\\', '/')
}
