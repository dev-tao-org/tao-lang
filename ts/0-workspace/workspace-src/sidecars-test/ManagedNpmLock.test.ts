import { NewlineCharacter, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { prepareManagedModules, readManagedModules } from '../sidecars/managed-modules/ManagedModules'
import type { BunExecutor, ManagedModulesInput } from '../sidecars/managed-modules/ManagedModuleTypes'
import { writeLock } from './ManagedModuleFixtures'

const ManagedNpmLockSuffixRegx = /\.lock$/
const MissingDurableLockErrorRegx = /durable lock is missing/

Tests.test('reuses the same npm profile when module directories move within the project', async () =>
  await withProject(async root => {
    const first = Path.join(root, 'Modules')
    const second = Path.join(root, 'Elsewhere')
    await FileSystem.mkdirs(first, second)
    const initial = input(root, [{ directory: first, requirements: [dateFns] }])
    const prepared = await prepareManagedModules(initial, executor(['date-fns', '4.1.0']))
    const moved = input(root, [{ directory: second, requirements: [dateFns] }])
    const reused = await prepareManagedModules(moved, executor(['date-fns', '4.1.0']))
    Tests.expect(reused.graphFingerprint).toBe(prepared.graphFingerprint)
    Tests.expect(reused.fingerprint).toBe(prepared.fingerprint)
    Tests.expect(await readManagedModules(moved)).toEqual(reused)
  }))

Tests.test('changed exact roots resolve a new graph despite an intact old source reference', async () =>
  await withProject(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FileSystem.mkdir(moduleDirectory)
    const original = input(root, [{ directory: moduleDirectory, requirements: [dateFns] }])
    const first = await prepareManagedModules(original, executor(['date-fns', '4.1.0']))
    const oldLockPath = Path.join(root, '.tao', 'store', 'npm', `${first.graphFingerprint}.lock`)
    const oldLock = await FileSystem.readFile(oldLockPath, 'utf8')
    const newInput = input(root, [{
      directory: moduleDirectory,
      requirements: [{ name: 'lodash', version: '4.17.21', origin: 'Modules/Lodash.tao' }],
    }])
    newInput.previousGraphReference = {
      fingerprint: first.graphFingerprint,
      lockPath: `.tao/store/npm/${first.graphFingerprint}.lock`,
      lockHash: Platform.hashText(oldLock),
    }
    let frozen = false
    const prepared = await prepareManagedModules(newInput, async (_command, args, cwd) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
      }
      frozen ||= args.includes('--frozen-lockfile')
      await writeGraph(cwd, ['lodash', '4.17.21'])
      return { status: 0, stdout: '', stderr: '' }
    })
    Tests.expect(prepared.graphFingerprint).not.toBe(first.graphFingerprint)
    Tests.expect(frozen).toBe(false)
    Tests.expect(await FileSystem.readFile(oldLockPath, 'utf8')).toBe(oldLock)
    Tests.expect(await readManagedModules(newInput)).toEqual(prepared)
  }))

Tests.test('missing durable locks are rejected for a prepared current profile', async () =>
  await withProject(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FileSystem.mkdir(moduleDirectory)
    const current = input(root, [{ directory: moduleDirectory, requirements: [dateFns] }])
    const prepared = await prepareManagedModules(current, executor(['date-fns', '4.1.0']))
    const durableLock = Path.join(root, '.tao', 'store', 'npm', `${prepared.graphFingerprint}.lock`)
    await FileSystem.rm(durableLock, { force: true })
    await FileSystem.rm(durableLock.replace(ManagedNpmLockSuffixRegx, '.sha256'), { force: true })
    let invoked = false
    await Tests.rejects(
      prepareManagedModules(current, async () => {
        invoked = true
        return { status: 0, stdout: '', stderr: '' }
      }),
      MissingDurableLockErrorRegx,
    )
    Tests.expect(invoked).toBe(false)
  }))

Tests.test('Bun upgrades reuse byte-identical durable graphs from exact source references', async () =>
  await withProject(async root => {
    const moduleDirectory = Path.join(root, 'Modules')
    await FileSystem.mkdir(moduleDirectory)
    const initial = input(root, [{ directory: moduleDirectory, requirements: [dateFns] }])
    const first = await prepareManagedModules(initial, executor(['date-fns', '4.1.0']))
    const durable = Path.join(root, '.tao', 'store', 'npm', `${first.graphFingerprint}.lock`)
    const bytes = await FileSystem.readFile(durable, 'utf8')
    const identity = 'e'.repeat(64)
    const referencePath = Path.join(root, '.tao', 'store', 'npm', `${identity}.lock`)
    await FileSystem.writeFile(referencePath, bytes)
    await FileSystem.writeFile(
      referencePath.replace(ManagedNpmLockSuffixRegx, '.sha256'),
      `${Platform.hashText(bytes)}${NewlineCharacter}`,
    )
    await FileSystem.rm(durable, { force: true })
    await FileSystem.rm(durable.replace(ManagedNpmLockSuffixRegx, '.sha256'), { force: true })
    let frozen = false
    const upgradedInput = {
      ...initial,
      bunVersion: '1.3.0',
      previousGraphReference: {
        fingerprint: identity,
        lockPath: `.tao/store/npm/${identity}.lock`,
        lockHash: Platform.hashText(bytes),
      },
    }
    const upgraded = await prepareManagedModules(upgradedInput, async (_command, args, cwd) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: '1.3.0' + NewlineCharacter, stderr: '' }
      }
      frozen ||= args.includes('--frozen-lockfile')
      await writePackages(cwd, { 'react': '19.1.0', 'date-fns': '4.1.0' })
      return { status: 0, stdout: '', stderr: '' }
    })
    Tests.expect(upgraded.graphFingerprint).toBe(first.graphFingerprint)
    Tests.expect(upgraded.fingerprint).not.toBe(first.fingerprint)
    Tests.expect(frozen).toBe(true)
    Tests.expect(await FileSystem.readFile(durable, 'utf8')).toBe(bytes)
  }))

const dateFns = { name: 'date-fns', version: '4.1.0', origin: 'Modules/Date.tao' }

function input(
  directory: string,
  modules: ManagedModulesInput['modules'],
): ManagedModulesInput {
  return { directory, modules, target: 'browser', runtimePins: { react: '19.1.0' }, bunVersion: '1.2.0' }
}

function executor(dependency: [string, string]): BunExecutor {
  return async (_command, args, cwd) => {
    if (args[0] === '--version') {
      return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
    }
    if (!args.includes('--frozen-lockfile')) {
      await writeGraph(cwd, dependency)
    }
    return { status: 0, stdout: '', stderr: '' }
  }
}

async function writeGraph(root: string, dependency: [string, string]): Promise<void> {
  const dependencies = { react: '19.1.0', [dependency[0]]: dependency[1] }
  await writeLock(root, dependencies)
  await writePackages(root, dependencies)
}

async function writePackages(root: string, dependencies: Record<string, string>): Promise<void> {
  for (const [name, version] of Object.entries(dependencies)) {
    const packageDirectory = Path.join(root, 'node_modules', name)
    await FileSystem.mkdir(packageDirectory)
    await FileSystem.writeFile(Path.join(packageDirectory, 'package.json'), JSON.stringify({ name, version }))
  }
}

async function withProject(action: (root: string) => Promise<void>): Promise<void> {
  const root = Artifacts.resolvePath('tmp', `managed-npm-lock-${Platform.randomUUID()}`)
  await FileSystem.mkdir(root)
  await Try(() => action(root), { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
}
