import { NewlineCharacter, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { prepareManagedModules } from '../../workspace-src/sidecars/ManagedModule/ManagedModules'
import type { BunExecutor } from '../../workspace-src/sidecars/ManagedModule/ManagedModuleTypes'
import { writeLock } from './ManagedModule.test-fixtures'

const IncompatibleNativeSingletonVersionsErrorRegx = /incompatible singleton native-fixture.*1\.0\.0.*2\.0\.0/

Tests.test('rejects duplicate versions of an implicitly detected native package', async () => {
  await withTemporaryDirectory(async directory => {
    await Tests.rejects(
      prepareManagedModules(input(directory), nativeGraphExecutor),
      IncompatibleNativeSingletonVersionsErrorRegx,
    )
  })
})

function input(directory: string) {
  return {
    directory,
    modules: [
      {
        directory: Path.join(directory, 'ModuleA'),
        requirements: [{ name: 'wrapper-a', version: '1.0.0', origin: 'A.tao' }],
      },
      {
        directory: Path.join(directory, 'ModuleB'),
        requirements: [{ name: 'wrapper-b', version: '1.0.0', origin: 'B.tao' }],
      },
    ],
    target: 'browser',
    runtimePins: {},
    bunVersion: '1.2.0',
  }
}

const nativeGraphExecutor: BunExecutor = async (_command, args, directory) => {
  if (args[0] === '--version') {
    return { status: 0, stdout: '1.2.0' + NewlineCharacter, stderr: '' }
  }
  const dependencies = { 'wrapper-a': '1.0.0', 'wrapper-b': '1.0.0' }
  await writeLock(directory, dependencies)
  await writePackage(directory, 'wrapper-a', '1.0.0', { 'native-fixture': '^1.0.0' })
  await writePackage(directory, 'wrapper-b', '1.0.0', { 'native-fixture': '^2.0.0' })
  await writeNativePackage(Path.join(directory, 'node_modules', 'wrapper-a', 'node_modules'), '1.0.0')
  await writeNativePackage(Path.join(directory, 'node_modules', 'wrapper-b', 'node_modules'), '2.0.0')
  return { status: 0, stdout: '', stderr: '' }
}

async function writePackage(
  root: string,
  name: string,
  version: string,
  dependencies: Record<string, string>,
): Promise<void> {
  const directory = Path.join(root, 'node_modules', name)
  await FS.mkdir(directory)
  await FS.writeFile(Path.join(directory, 'package.json'), JSON.stringify({ name, version, dependencies }))
}

async function writeNativePackage(root: string, version: string): Promise<void> {
  const directory = Path.join(root, 'native-fixture')
  await FS.mkdir(directory)
  await FS.writeFile(
    Path.join(directory, 'package.json'),
    JSON.stringify({ name: 'native-fixture', version, codegenConfig: { name: 'Fixture' } }),
  )
}

async function withTemporaryDirectory(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = Artifacts.resolvePath('tmp', `native-singleton-${Platform.randomUUID()}`)
  await FS.mkdir(directory)
  await Try(() => action(directory), {
    finally: () => FS.rm(directory, { recursive: true, force: true }),
  })
}
