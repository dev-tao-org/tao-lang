import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { prepareNativeLock } from '../cli-checks/native-lock-build'
import {
  nativeLockVersionRoot,
  publishNativeLockVersion,
  readNativeLockPointer,
} from '../cli-checks/NativeLockPublication'

Tests.test('repairs a partial active native-lock version without changing its published files', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-publication-'))
  const identity = 'a'.repeat(64)
  const active = Path.join(root, identity)
  const staging = Path.join(root, 'staging')
  await Try(async () => {
    await FileSystem.mkdir(Path.join(active, 'build/Release'), { recursive: true })
    await FileSystem.mkdir(Path.join(staging, 'build/Release'), { recursive: true })
    await FileSystem.writeFile(Path.join(active, 'active-addon.marker'), 'keep')
    await FileSystem.writeFile(Path.join(staging, 'build/Release/tao_os_locks.node'), 'rebuilt')
    await FileSystem.writeFile(Path.join(root, 'current.json'), JSON.stringify({ identity, directory: identity }))
    await publishNativeLockVersion(root, staging, identity)

    const pointer = await readNativeLockPointer(root)
    Tests.expect(pointer).toBeDefined()
    Tests.expect(pointer!.directory).not.toBe(identity)
    Tests.expect(await FileSystem.readFile(Path.join(active, 'active-addon.marker'), 'utf8')).toBe('keep')
    Tests.expect(await FileSystem.readFile(Path.join(nativeLockVersionRoot(root, pointer!), 'inputs.json'), 'utf8'))
      .toBe(identity)
    Tests.expect(
      await FileSystem.readFile(
        Path.join(nativeLockVersionRoot(root, pointer!), 'build/Release/tao_os_locks.node'),
        'utf8',
      ),
    ).toBe('rebuilt')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('rejects native-lock pointers that escape the version cache', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-'))
  await Try(async () => {
    await FileSystem.writeFile(
      Path.join(root, 'current.json'),
      JSON.stringify({ identity: 'a'.repeat(64), directory: '../outside' }),
    )
    await Tests.rejects(readNativeLockPointer(root), /outdated.*\.\/agent setup/)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('rejects previous identity-only native-lock pointers with setup guidance', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-old-'))
  await Try(async () => {
    await FileSystem.writeFile(Path.join(root, 'current.json'), JSON.stringify({ identity: 'a'.repeat(64) }))
    await Tests.rejects(readNativeLockPointer(root), /outdated.*\.\/agent setup/)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('retains the current native-lock pointer directory', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-current-'))
  const identity = 'b'.repeat(64)
  const directory = `${identity}-12345678-1234-1234-1234-123456789abc`
  await Try(async () => {
    await FileSystem.writeFile(Path.join(root, 'current.json'), JSON.stringify({ identity, directory }))
    Tests.expect(await readNativeLockPointer(root)).toEqual({ identity, directory })
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('setup repairs an outdated pointer from independently verified immutable output', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-repair-'))
  const identity = 'c'.repeat(64)
  const addon = Path.join(root, identity, 'build/Release/tao_os_locks.node')
  let built = false
  await Try(async () => {
    await FileSystem.mkdir(Path.dirname(addon), { recursive: true })
    await FileSystem.writeFile(addon, 'verified-addon')
    await FileSystem.writeFile(Path.join(root, identity, 'inputs.json'), identity)
    await FileSystem.writeFile(Path.join(root, 'current.json'), JSON.stringify({ identity }))

    await prepareNativeLock(root, identity, async pointer => {
      const versionRoot = nativeLockVersionRoot(root, pointer)
      return await FileSystem.readFile(Path.join(versionRoot, 'inputs.json'), 'utf8') === identity
        && await FileSystem.exists(Path.join(versionRoot, 'build/Release/tao_os_locks.node'))
    }, async () => {
      built = true
    })

    Tests.expect(built).toBe(false)
    Tests.expect(await readNativeLockPointer(root)).toEqual({ identity, directory: identity })
    Tests.expect(await FileSystem.readFile(addon, 'utf8')).toBe('verified-addon')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
