import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import {
  prepareManagedModules,
  repairManagedModuleFiles,
} from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'

const ManagedModuleAlreadyOwnedErrorRegx = /already owned/

Tests.test('repairs corrupt current profile metadata only from an intact durable lock', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-metadata-${Platform.randomUUID()}`)
  const moduleDirectory = Path.join(directory, 'Module')
  await FS.mkdir(moduleDirectory)
  const input: ManagedModulesInput = {
    directory,
    modules: [{ directory: moduleDirectory, requirements: [] }],
    target: 'browser',
    runtimePins: { react: '19.1.0' },
    bunVersion: '1.2.0',
  }
  await Try(async () => await assertVerifiedRepair(input, fixtureExecutor), {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
})

async function assertVerifiedRepair(input: ManagedModulesInput, baseExecutor: BunExecutor): Promise<void> {
  const prepared = await prepareManagedModules(input, baseExecutor)
  const metadata = Path.join(prepared.packageDirectory, '.tao-managed.json')
  const durableLock = Path.join(input.directory, '.tao', 'store', 'npm', `${prepared.graphFingerprint}.lock`)
  const originalLock = await FS.readFile(durableLock, 'utf8')
  const originalMetadata = await FS.readFile(metadata, 'utf8')
  const foreign = JSON.parse(originalMetadata)
  foreign.fingerprint = 'f'.repeat(64)
  await FS.chmod(metadata, 0o644)
  await FS.writeFile(metadata, JSON.stringify(foreign))
  await Tests.rejects(repairManagedModuleFiles(input, baseExecutor), ManagedModuleAlreadyOwnedErrorRegx)
  await FS.writeFile(metadata, originalMetadata)
  let frozenInstalls = 0
  const executor: BunExecutor = async (command, args, cwd) => {
    if (args.includes('--frozen-lockfile')) {
      frozenInstalls += 1
    }
    return await baseExecutor(command, args, cwd)
  }
  for (const contents of ['{}', JSON.stringify({ fingerprint: prepared.fingerprint }), '{ invalid json']) {
    await FS.chmod(metadata, 0o644)
    await FS.writeFile(metadata, contents)
    await repairManagedModuleFiles(input, executor)
    Tests.expect(await FS.readFile(metadata, 'utf8')).toContain(prepared.fingerprint)
    Tests.expect(await FS.readFile(durableLock, 'utf8')).toBe(originalLock)
  }
  Tests.expect(frozenInstalls).toBe(3)
}

const fixtureExecutor: BunExecutor = async (_command, args, cwd) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
  }
  const lock = Path.join(cwd, 'bun.lock')
  if (!await FS.exists(lock)) {
    const dependencies = { react: '19.1.0' }
    const packages = { react: ['react@19.1.0', '', {}, 'sha512-react'] }
    await FS.writeFile(
      lock,
      JSON.stringify({ lockfileVersion: 1, workspaces: { '': { dependencies } }, packages }),
    )
  }
  const react = Path.join(cwd, 'node_modules', 'react')
  await FS.mkdir(react)
  await FS.writeFile(Path.join(react, 'package.json'), '{"name":"react","version":"19.1.0"}')
  return { status: 0, stdout: '', stderr: '' }
}
