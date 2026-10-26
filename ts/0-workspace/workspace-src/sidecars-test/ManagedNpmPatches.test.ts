import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareManagedModules, readManagedModules, repairManagedModuleFiles } from '../sidecars/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../sidecars/ManagedModuleTypes'

Tests.test('installs runtime patches in isolated managed profiles and preserves durable pins when patch bytes change', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-patches-${Platform.randomUUID()}`)
  await FileSystem.mkdir(directory, { recursive: true })
  await Try(() => assertPatchedProfile(directory), {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
})

Tests.test('repairs runtime policy through a frozen copy while preserving every durable package resolution', async () => {
  const directory = Artifacts.resolvePath('tmp', `managed-policy-repair-${Platform.randomUUID()}`)
  await FileSystem.mkdir(directory, { recursive: true })
  await Try(() => assertPolicyRepair(directory), {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
})

async function assertPolicyRepair(directory: string): Promise<void> {
  const invocations: string[][] = []
  const original = { ...createInput(directory), runtimePolicy: undefined }
  const first = await prepareManagedModules(original, createExecutor(invocations))
  const sourcePath = Path.join(directory, '.tao/store/npm', `${first.graphFingerprint}.lock`)
  const source = await FileSystem.readFile(sourcePath, 'utf8')
  const input = {
    ...createInput(directory),
    previousGraphReference: {
      fingerprint: first.graphFingerprint,
      lockPath: `.tao/store/npm/${first.graphFingerprint}.lock`,
      lockHash: Platform.hashText(source),
    },
  }
  await Tests.rejects(prepareManagedModules(input, createExecutor(invocations)), /policy changed/)
  await Tests.rejects(
    repairManagedModuleFiles(input, async (_command, args) =>
      args[0] === '--version'
        ? { status: 0, stdout: '1.2.0\n', stderr: '' }
        : { status: 1, stdout: '', stderr: 'fixture frozen failure' }),
    /fixture frozen failure/,
  )
  const durableFiles = await FileSystem.readdir(Path.dirname(sourcePath))
  Tests.expect(durableFiles.filter(path => path.endsWith('.lock'))).toEqual([`${first.graphFingerprint}.lock`])
  Tests.expect(await FileSystem.readFile(sourcePath, 'utf8')).toBe(source)
  const repaired = await repairManagedModuleFiles(input, createExecutor(invocations))
  Tests.expect(repaired.graphFingerprint).not.toBe(first.graphFingerprint)
  Tests.expect(invocations.at(-1)).toContain('--frozen-lockfile')
  const lock = await FileSystem.readFile(repaired.lockfile, 'utf8')
  Tests.expect(JSON.parse(lock).packages).toEqual(JSON.parse(source).packages)
  Tests.expect(await FileSystem.readFile(sourcePath, 'utf8')).toBe(source)
  const incompatible = createInput(directory)
  incompatible.runtimePolicy!.overrides.fixture = '2.0.0'
  await Tests.rejects(
    repairManagedModuleFiles(
      { ...incompatible, previousGraphReference: input.previousGraphReference },
      createExecutor(invocations),
    ),
    /Frozen repair cannot change package resolutions/,
  )
}

async function assertPatchedProfile(directory: string): Promise<void> {
  const input = createInput(directory)
  const invocations: string[][] = []
  const first = await prepareManagedModules(input, createExecutor(invocations))
  const manifest = JSON.parse(await FileSystem.readFile(Path.join(first.packageDirectory, 'package.json'), 'utf8'))
  Tests.expect(manifest.patchedDependencies).toEqual({ 'fixture@1.0.0': 'patches/fixture.patch' })
  Tests.expect(manifest.overrides).toEqual({ fixture: '1.0.0' })
  const durablePath = Path.join(directory, '.tao/store/npm', `${first.graphFingerprint}.lock`)
  const originalLock = await FileSystem.readFile(durablePath, 'utf8')
  const patchPath = Path.join(first.packageDirectory, 'patches/fixture.patch')
  Tests.expect(await FileSystem.readFile(patchPath, 'utf8')).toBe('original patch\n')
  await FileSystem.chmod(patchPath, 0o644)
  await FileSystem.writeFile(patchPath, 'tampered')
  await Tests.rejects(readManagedModules(input), /patch.*drifted/)
  await Tests.rejects(prepareManagedModules(input, createExecutor(invocations)), /metadata drifted/)
  const changed = createInput(directory, 'changed patch\n')
  const second = await prepareManagedModules(changed, createExecutor(invocations))
  Tests.expect(second.graphFingerprint).toBe(first.graphFingerprint)
  Tests.expect(second.fingerprint).not.toBe(first.fingerprint)
  Tests.expect(invocations.at(-1)).toContain('--frozen-lockfile')
  Tests.expect(await FileSystem.readFile(durablePath, 'utf8')).toBe(originalLock)
  Tests.expect(await readManagedModules(changed)).toEqual(second)
}

function createInput(directory: string, patch = 'original patch\n'): ManagedModulesInput {
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
      return { status: 0, stdout: '1.2.0\n', stderr: '' }
    }
    invocations.push([...args])
    const manifest = JSON.parse(await FileSystem.readFile(Path.join(cwd, 'package.json'), 'utf8'))
    if (manifest.patchedDependencies) {
      Tests.expect(await FileSystem.exists(Path.join(cwd, 'patches/fixture.patch'))).toBe(true)
    }
    if (!args.includes('--frozen-lockfile')) {
      await FileSystem.writeFile(
        Path.join(cwd, 'bun.lock'),
        JSON.stringify({
          workspaces: { '': { dependencies: manifest.dependencies } },
          packages: { fixture: ['fixture@1.0.0', '', {}, 'sha512-fixture'] },
          patchedDependencies: manifest.patchedDependencies,
          overrides: manifest.overrides,
        }),
      )
    }
    const packageDirectory = Path.join(cwd, 'node_modules/fixture')
    await FileSystem.mkdir(packageDirectory, { recursive: true })
    await FileSystem.writeFile(Path.join(packageDirectory, 'package.json'), '{"name":"fixture","version":"1.0.0"}')
    return { status: 0, stdout: '', stderr: '' }
  }
}
