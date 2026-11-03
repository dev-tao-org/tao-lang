import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as ManagedModules from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'
import { writeLock } from './ManagedModule.test-fixtures'

const ManagedModuleRepairRequiredErrorRegx = /needs repair/
const MarkerOwnershipProofRequiredErrorRegx = /cannot prove that the generated metadata belongs.*Preserve this marker/

Tests.test('repairs a corrupt marker only with generated file and profile link proof', async () =>
  await withDirectory(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FS.mkdir(moduleDirectory)
    const input = createModuleInput(root, moduleDirectory)
    const executor = createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' })
    await ManagedModules.prepareManagedModules(input, executor)
    const marker = Path.join(moduleDirectory, '.tao-managed-module.json')
    await makeCorrupt(marker)
    await Tests.rejects(ManagedModules.prepareManagedModules(input, executor), ManagedModuleRepairRequiredErrorRegx)
    await ManagedModules.repairManagedModuleFiles(input, executor)
    Tests.expect(JSON.parse(await FS.readFile(marker, 'utf8')).profile).toContain('.tao/cache/managed-modules')
    const manifest = Path.join(moduleDirectory, 'package.json')
    await FS.chmod(manifest, 0o644)
    await FS.writeFile(manifest, '{"authored":true}' + NewlineCharacter)
    await makeCorrupt(marker)
    await Tests.rejects(
      ManagedModules.repairManagedModuleFiles(input, executor),
      MarkerOwnershipProofRequiredErrorRegx,
    )
    Tests.expect(await FS.readFile(manifest, 'utf8')).toBe('{"authored":true}\n')
  }))

Tests.test('clean warns and preserves authored files and links for a corrupt marker', async () =>
  await withDirectory(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FS.mkdir(moduleDirectory)
    await ManagedModules.prepareManagedModules(
      createModuleInput(root, moduleDirectory),
      createExecutor({ 'react': '19.1.0', 'date-fns': '4.1.0' }),
    )
    const marker = Path.join(moduleDirectory, '.tao-managed-module.json')
    const manifest = Path.join(moduleDirectory, 'package.json')
    const link = Path.join(moduleDirectory, 'node_modules', 'react')
    await makeCorrupt(marker)
    await FS.chmod(manifest, 0o644)
    await FS.writeFile(manifest, '{"authored":true}' + NewlineCharacter)
    const warnings = await ManagedModules.cleanManagedModuleMetadata(root)
    Tests.expect(warnings.some(warning => warning.includes(marker))).toBe(true)
    Tests.expect(await FS.readFile(manifest, 'utf8')).toBe('{"authored":true}\n')
    Tests.expect(FS.lstatSync(link).isSymbolicLink()).toBe(true)
    Tests.expect(await FS.readFile(marker, 'utf8')).toBe('{')
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
      return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
    }
    if (args.includes('--frozen-lockfile')) {
      return { status: 0, stdout: '', stderr: '' }
    }
    await writeLock(cwd, dependencies)
    for (const [name, version] of Object.entries(dependencies)) {
      const directory = Path.join(cwd, 'node_modules', name)
      await FS.mkdir(directory)
      await FS.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ name, version }))
      await FS.writeFile(Path.join(directory, 'index.js'), 'module.exports = {}')
    }
    return { status: 0, stdout: '', stderr: '' }
  }
}

async function makeCorrupt(marker: string): Promise<void> {
  await FS.chmod(marker, 0o644)
  await FS.writeFile(marker, '{')
}

async function withDirectory(action: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `managed-marker-${Platform.randomUUID()}`)
  await FS.mkdir(root)
  await Try(() => action(root), {
    finally: () => FS.rm(root, { recursive: true, force: true }),
  })
}
