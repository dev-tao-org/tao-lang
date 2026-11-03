import { Json } from '@shared'
import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as ManagedModules from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type * as ManagedModuleTypes from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'

const ManagedModuleAlreadyOwnedErrorRegx = /already owned/

Tests.test('repairs corrupt current profile metadata only from an intact durable lock', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-metadata-${Platform.randomUUID()}`)
  const moduleDirectory = Path.join(directory, 'Module')
  await FS.mkdir(moduleDirectory)
  const input: ManagedModuleTypes.ManagedModulesInput = {
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

async function assertVerifiedRepair(
  input: ManagedModuleTypes.ManagedModulesInput,
  baseExecutor: ManagedModuleTypes.BunExecutor,
): Promise<void> {
  const prepared = await ManagedModules.prepareManagedModules(input, baseExecutor)
  const metadata = Path.join(prepared.packageDirectory, '.tao-managed.json')
  const durableLock = Path.join(input.directory, '.tao', 'store', 'npm', `${prepared.graphFingerprint}.lock`)
  const originalLock = await FS.readFile(durableLock, 'utf8')
  const originalMetadata = await FS.readFile(metadata, 'utf8')
  const foreign = Json.Parse(originalMetadata) as ManagedNpmFixtureMetadata
  foreign.fingerprint = 'f'.repeat(64)
  await FS.chmod(metadata, 0o644)
  await FS.writeFile(metadata, Json.Print(foreign))
  await Tests.rejects(ManagedModules.repairManagedModuleFiles(input, baseExecutor), ManagedModuleAlreadyOwnedErrorRegx)
  await FS.writeFile(metadata, originalMetadata)
  let frozenInstalls = 0
  const executor: ManagedModuleTypes.BunExecutor = async (command, args, cwd) => {
    if (args.includes('--frozen-lockfile')) {
      frozenInstalls += 1
    }
    return await baseExecutor(command, args, cwd)
  }
  for (const contents of ['{}', Json.Print({ fingerprint: prepared.fingerprint }), '{ invalid json']) {
    await FS.chmod(metadata, 0o644)
    await FS.writeFile(metadata, contents)
    await ManagedModules.repairManagedModuleFiles(input, executor)
    Tests.expect(await FS.readFile(metadata, 'utf8')).toContain(prepared.fingerprint)
    Tests.expect(await FS.readFile(durableLock, 'utf8')).toBe(originalLock)
  }
  Tests.expect(frozenInstalls).toBe(3)
}

const fixtureExecutor: ManagedModuleTypes.BunExecutor = async (_command, args, cwd) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
  }
  const lock = Path.join(cwd, 'bun.lock')
  if (!await FS.exists(lock)) {
    const dependencies = { react: '19.1.0' }
    const packages = { react: ['react@19.1.0', '', {}, 'sha512-react'] }
    await FS.writeFile(
      lock,
      Json.Print({ lockfileVersion: 1, workspaces: { '': { dependencies } }, packages }),
    )
  }
  const react = Path.join(cwd, 'node_modules', 'react')
  await FS.mkdir(react)
  await FS.writeFile(Path.join(react, 'package.json'), '{"name":"react","version":"19.1.0"}')
  return { status: 0, stdout: '', stderr: '' }
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type ManagedNpmFixtureMetadata = Record<string, unknown>
