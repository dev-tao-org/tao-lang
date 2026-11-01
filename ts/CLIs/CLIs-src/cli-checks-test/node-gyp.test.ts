import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Tests } from '@shared/os'
import { nodeGypOptions } from '../cli-checks/NodeGyp'

Tests.test('shared node-gyp options use local headers and deduplicate the warning flag', async () => {
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/node-gyp-options-'))
  const nodeRoot = Path.join(root, 'node')
  const executable = Path.join(nodeRoot, 'bin/node')
  await Try(async () => {
    await FileSystem.mkdir(Path.join(nodeRoot, 'include/node'))
    await FileSystem.writeFile(Path.join(nodeRoot, 'include/node/node.h'), '')
    const options = nodeGypOptions(executable, '--trace-warnings --disable-warning=DEP0169')
    Tests.expect(options.root).toBe(nodeRoot)
    Tests.expect(options.headers).toEqual(['--nodedir', nodeRoot])
    Tests.expect(options.environment.NODE_OPTIONS).toBe('--trace-warnings --disable-warning=DEP0169')
    Tests.expect(nodeGypOptions(executable, undefined).environment.NODE_OPTIONS).toBe('--disable-warning=DEP0169')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
