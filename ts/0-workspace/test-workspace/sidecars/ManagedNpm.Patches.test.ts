import { Json } from '@shared'
import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as ManagedModules from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'

const ManagedModulePolicyChangeErrorRegx = /policy changed/
const FrozenInstallFailureErrorRegx = /fixture frozen failure/
const FrozenPackageResolutionChangeErrorRegx = /Frozen repair cannot change package resolutions/
const RuntimePatchDriftErrorRegx = /patch.*drifted/
const RuntimeMetadataDriftErrorRegx = /metadata drifted/

Tests.test('installs runtime patches in isolated managed profiles and preserves durable pins when patch bytes change', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-patches-${Platform.randomUUID()}`)
  await FS.mkdir(directory)
  await Try(() => assertPatchedProfile(directory), {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
})

Tests.test('repairs runtime policy through a frozen copy while preserving every durable package resolution', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-policy-repair-${Platform.randomUUID()}`)
  await FS.mkdir(directory)
  await Try(() => assertPolicyRepair(directory), {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
})

Tests.test('removing runtime policy preserves durable package resolutions through frozen repair', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-policy-removal-${Platform.randomUUID()}`)
  await FS.mkdir(directory)
  await Try(async () => {
    const input = createInput(directory)
    const invocations: string[][] = []
    const original = await ManagedModules.prepareManagedModules(input, createExecutor(invocations))
    const lockPath = `.tao/store/npm/${original.graphFingerprint}.lock`
    const source = await FS.readFile(Path.join(directory, lockPath), 'utf8')
    const removed = {
      ...input,
      runtimePolicy: undefined,
      previousGraphReference: { fingerprint: original.graphFingerprint, lockPath, lockHash: Platform.hashText(source) },
    }
    const repaired = await ManagedModules.repairManagedModuleFiles(removed, createExecutor(invocations))
    const lock = Json.Parse(await FS.readFile(repaired.lockfile, 'utf8')) as ManagedPatchFixtureRecord
    Tests.expect(invocations.at(-1)).toContain('--frozen-lockfile')
    Tests.expect(lock.packages).toEqual({ fixture: ['fixture@1.0.0', '', {}, 'sha512-fixture'] })
    Tests.expect(lock).not.toHaveProperty('patchedDependencies')
    Tests.expect(lock).not.toHaveProperty('overrides')
    Tests.expect(await ManagedModules.readManagedModules(removed)).toEqual(repaired)
    Tests.expect(await FS.readFile(Path.join(directory, lockPath), 'utf8')).toBe(source)
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})

async function assertPolicyRepair(directory: string): Promise<void> {
  const invocations: string[][] = []
  const original = { ...createInput(directory), runtimePolicy: undefined }
  const first = await ManagedModules.prepareManagedModules(original, createExecutor(invocations))
  const sourcePath = Path.join(directory, '.tao/store/npm', `${first.graphFingerprint}.lock`)
  const source = await FS.readFile(sourcePath, 'utf8')
  const input = {
    ...createInput(directory),
    previousGraphReference: {
      fingerprint: first.graphFingerprint,
      lockPath: `.tao/store/npm/${first.graphFingerprint}.lock`,
      lockHash: Platform.hashText(source),
    },
  }
  await Tests.rejects(
    ManagedModules.prepareManagedModules(input, createExecutor(invocations)),
    ManagedModulePolicyChangeErrorRegx,
  )
  await Tests.rejects(
    ManagedModules.repairManagedModuleFiles(input, async (_command, args) =>
      args[0] === '--version'
        ? { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
        : { status: 1, stdout: '', stderr: 'fixture frozen failure' }),
    FrozenInstallFailureErrorRegx,
  )
  const durableFiles = await FS.readdir(Path.dirname(sourcePath))
  Tests.expect(durableFiles.filter(path => path.endsWith('.lock'))).toEqual([`${first.graphFingerprint}.lock`])
  Tests.expect(await FS.readFile(sourcePath, 'utf8')).toBe(source)
  const repaired = await ManagedModules.repairManagedModuleFiles(input, createExecutor(invocations))
  Tests.expect(repaired.graphFingerprint).not.toBe(first.graphFingerprint)
  Tests.expect(invocations.at(-1)).toContain('--frozen-lockfile')
  const lock = await FS.readFile(repaired.lockfile, 'utf8')
  Tests.expect((Json.Parse(lock) as ManagedPatchFixtureRecord).packages).toEqual(
    (Json.Parse(source) as ManagedPatchFixtureRecord).packages,
  )
  Tests.expect(await FS.readFile(sourcePath, 'utf8')).toBe(source)
  const incompatible = createInput(directory)
  incompatible.runtimePolicy!.overrides.fixture = '2.0.0'
  await Tests.rejects(
    ManagedModules.repairManagedModuleFiles(
      { ...incompatible, previousGraphReference: input.previousGraphReference },
      createExecutor(invocations),
    ),
    FrozenPackageResolutionChangeErrorRegx,
  )
}

async function assertPatchedProfile(directory: string): Promise<void> {
  const input = createInput(directory)
  const invocations: string[][] = []
  const first = await ManagedModules.prepareManagedModules(input, createExecutor(invocations))
  const manifest = Json.Parse(
    await FS.readFile(Path.join(first.packageDirectory, 'package.json'), 'utf8'),
  ) as ManagedPatchFixtureRecord
  Tests.expect(manifest.patchedDependencies).toEqual({ 'fixture@1.0.0': 'patches/fixture.patch' })
  Tests.expect(manifest.overrides).toEqual({ fixture: '1.0.0' })
  const durablePath = Path.join(directory, '.tao/store/npm', `${first.graphFingerprint}.lock`)
  const originalLock = await FS.readFile(durablePath, 'utf8')
  const patchPath = Path.join(first.packageDirectory, 'patches/fixture.patch')
  Tests.expect(await FS.readFile(patchPath, 'utf8')).toBe('original patch\n')
  await FS.chmod(patchPath, 0o644)
  await FS.writeFile(patchPath, 'tampered')
  await Tests.rejects(ManagedModules.readManagedModules(input), RuntimePatchDriftErrorRegx)
  await Tests.rejects(
    ManagedModules.prepareManagedModules(input, createExecutor(invocations)),
    RuntimeMetadataDriftErrorRegx,
  )
  const changed = createInput(directory, 'changed patch' + NewlineCharacter)
  const second = await ManagedModules.prepareManagedModules(changed, createExecutor(invocations))
  Tests.expect(second.graphFingerprint).toBe(first.graphFingerprint)
  Tests.expect(second.fingerprint).not.toBe(first.fingerprint)
  Tests.expect(invocations.at(-1)).toContain('--frozen-lockfile')
  Tests.expect(await FS.readFile(durablePath, 'utf8')).toBe(originalLock)
  Tests.expect(await ManagedModules.readManagedModules(changed)).toEqual(second)
}

function createInput(directory: string, patch = ('original patch' + NewlineCharacter)): ManagedModulesInput {
  return {
    directory,
    modules: [{ directory, requirements: [] }],
    target: 'web',
    runtimePins: { fixture: '1.0.0' },
    runtimePolicy: {
      patchedDependencies: { 'fixture@1.0.0': 'patches/fixture.patch' },
      overrides: { fixture: '1.0.0' },
      patches: { 'patches/fixture.patch': patch },
    },
    bunVersion: '1.2.0',
  }
}

function createExecutor(invocations: string[][]): BunExecutor {
  return async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
    }
    invocations.push([...args])
    const manifest = Json.Parse(await FS.readFile(Path.join(cwd, 'package.json'), 'utf8')) as ManagedPatchFixtureRecord
    if (manifest.patchedDependencies) {
      Tests.expect(await FS.exists(Path.join(cwd, 'patches/fixture.patch'))).toBe(true)
    }
    if (!args.includes('--frozen-lockfile')) {
      await FS.writeFile(
        Path.join(cwd, 'bun.lock'),
        Json.Print({
          workspaces: { '': { dependencies: manifest.dependencies } },
          packages: { fixture: ['fixture@1.0.0', '', {}, 'sha512-fixture'] },
          patchedDependencies: manifest.patchedDependencies,
          overrides: manifest.overrides,
        }),
      )
    }
    const packageDirectory = Path.join(cwd, 'node_modules/fixture')
    await FS.mkdir(packageDirectory)
    await FS.writeFile(Path.join(packageDirectory, 'package.json'), '{"name":"fixture","version":"1.0.0"}')
    return { status: 0, stdout: '', stderr: '' }
  }
}

// Authored fixture output is inspected and deliberately damaged by these tests.
type ManagedPatchFixtureRecord = Record<string, unknown>
