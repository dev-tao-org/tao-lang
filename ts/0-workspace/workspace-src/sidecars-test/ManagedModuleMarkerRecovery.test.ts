import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as ManagedModules from '../sidecars/managed-modules/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../sidecars/managed-modules/ManagedModuleTypes'

const ManagedModuleRepairRequiredErrorRegx = /needs repair/
const MarkerOwnershipProofRequiredErrorRegx = /cannot prove that the generated metadata belongs.*Preserve this marker/

Tests.test('repairs a corrupt marker only with generated file and profile link proof', async () =>
  await withDirectory(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FileSystem.mkdir(moduleDirectory)
    const input = createModuleInput(root, moduleDirectory)
    const executor = createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' })
    await ManagedModules.prepareManagedModules(input, executor)
    const marker = Path.join(moduleDirectory, '.tao-managed-module.json')
    await makeCorrupt(marker)
    await Tests.rejects(ManagedModules.prepareManagedModules(input, executor), ManagedModuleRepairRequiredErrorRegx)
    await ManagedModules.repairManagedModuleFiles(input, executor)
    Tests.expect(JSON.parse(await FileSystem.readFile(marker, 'utf8')).profile).toContain('.tao/cache/managed-modules')
    const manifest = Path.join(moduleDirectory, 'package.json')
    await FileSystem.chmod(manifest, 0o644)
    await FileSystem.writeFile(manifest, '{"authored":true}\n')
    await makeCorrupt(marker)
    await Tests.rejects(
      ManagedModules.repairManagedModuleFiles(input, executor),
      MarkerOwnershipProofRequiredErrorRegx,
    )
    Tests.expect(await FileSystem.readFile(manifest, 'utf8')).toBe('{"authored":true}\n')
  }))

Tests.test('clean warns and preserves authored files and links for a corrupt marker', async () =>
  await withDirectory(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FileSystem.mkdir(moduleDirectory)
    await ManagedModules.prepareManagedModules(
      createModuleInput(root, moduleDirectory),
      createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' }),
    )
    const marker = Path.join(moduleDirectory, '.tao-managed-module.json')
    const manifest = Path.join(moduleDirectory, 'package.json')
    const link = Path.join(moduleDirectory, 'node_modules', 'react')
    await makeCorrupt(marker)
    await FileSystem.chmod(manifest, 0o644)
    await FileSystem.writeFile(manifest, '{"authored":true}\n')
    const warnings = await ManagedModules.cleanManagedModuleMetadata(root)
    Tests.expect(warnings.some(warning => warning.includes(marker))).toBe(true)
    Tests.expect(await FileSystem.readFile(manifest, 'utf8')).toBe('{"authored":true}\n')
    Tests.expect(FileSystem.lstatSync(link).isSymbolicLink()).toBe(true)
    Tests.expect(await FileSystem.readFile(marker, 'utf8')).toBe('{')
  }))

function createModuleInput(root: string, directory: string): ManagedModulesInput {
  return {
    directory: root,
    modules: [{ directory, requirements: [{ name: 'date-fns', version: '4.1.0', origin: 'Modules/Date.tao' }] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
}

function createExecutor(dependencies: Record<string, string>): BunExecutor {
  return async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0\n', stderr: '' }
    }
    if (args.includes('--frozen-lockfile')) {
      return { status: 0, stdout: '', stderr: '' }
    }
    const packages = Object.fromEntries(
      Object.entries(dependencies).map(([name, version]) => [
        name,
        [`${name}@${version}`, '', {}, `sha512-${name}`],
      ]),
    )
    await FileSystem.writeFile(
      Path.join(cwd, 'bun.lock'),
      JSON.stringify({
        lockfileVersion: 1,
        workspaces: { '': { dependencies } },
        packages,
      }),
    )
    for (const [name, version] of Object.entries(dependencies)) {
      const directory = Path.join(cwd, 'node_modules', name)
      await FileSystem.mkdir(directory)
      await FileSystem.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ name, version }))
      await FileSystem.writeFile(Path.join(directory, 'index.js'), 'module.exports = {}')
    }
    return { status: 0, stdout: '', stderr: '' }
  }
}

async function makeCorrupt(marker: string): Promise<void> {
  await FileSystem.chmod(marker, 0o644)
  await FileSystem.writeFile(marker, '{')
}

async function withDirectory(action: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `managed-marker-${Platform.randomUUID()}`)
  await FileSystem.mkdir(root)
  await Try(() => action(root), {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
}
