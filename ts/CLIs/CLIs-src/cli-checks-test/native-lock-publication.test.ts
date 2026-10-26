import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import * as NativeLockPublication from '../cli-checks/NativeLockPublication'

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
    await NativeLockPublication.publishNativeLockVersion(root, staging, identity)

    const pointer = await NativeLockPublication.readNativeLockPointerForSetup(root)
    Tests.expect(pointer).toBeDefined()
    Tests.expect(pointer!.directory).not.toBe(identity)
    Tests.expect(await FileSystem.readFile(Path.join(active, 'active-addon.marker'), 'utf8')).toBe('keep')
    Tests.expect(
      await FileSystem.readFile(
        Path.join(NativeLockPublication.nativeLockVersionRoot(root, pointer!), 'inputs.json'),
        'utf8',
      ),
    )
      .toBe(identity)
    Tests.expect(
      await FileSystem.readFile(
        Path.join(NativeLockPublication.nativeLockVersionRoot(root, pointer!), 'build/Release/tao_os_locks.node'),
        'utf8',
      ),
    ).toBe('rebuilt')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('setup discards native-lock pointers that escape the version cache', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-'))
  await Try(async () => {
    await FileSystem.writeFile(
      Path.join(root, 'current.json'),
      JSON.stringify({ identity: 'a'.repeat(64), directory: '../outside' }),
    )
    Tests.expect(await NativeLockPublication.readNativeLockPointerForSetup(root)).toBeUndefined()
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('setup discards invalid native-lock pointer shapes', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-old-'))
  await Try(async () => {
    await FileSystem.writeFile(Path.join(root, 'current.json'), JSON.stringify({ identity: 'a'.repeat(64) }))
    Tests.expect(await NativeLockPublication.readNativeLockPointerForSetup(root)).toBeUndefined()
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('retains the current native-lock pointer directory', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/native-lock-pointer-current-'))
  const identity = 'b'.repeat(64)
  const directory = `${identity}-12345678-1234-1234-1234-123456789abc`
  await Try(async () => {
    await FileSystem.writeFile(Path.join(root, 'current.json'), JSON.stringify({ identity, directory }))
    Tests.expect(await NativeLockPublication.readNativeLockPointerForSetup(root)).toEqual({ identity, directory })
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
