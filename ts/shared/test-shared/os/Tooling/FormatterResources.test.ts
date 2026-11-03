import { Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform, Repo } from '@shared/os'
import * as Processes from '../../../shared-src/os/Processes'

Tests.test('setup can load formatter resources before the optional formatter package is installed', async () => {
  const directory = Artifacts.resolvePath('tmp', `formatter-bootstrap-${Platform.randomUUID()}`)
  await FS.mkdir(directory)
  await Try(async () => {
    const path = Path.join(directory, 'FormatterResources.ts')
    await FS.cp(Repo.resolvePath('ts/shared/shared-src/os/Tooling/FormatterResources.ts'), path)
    const result = await Processes.capture('node --experimental-strip-types -e', {
      variadicArgs: ['import(process.argv[1]).then(() => console.log("Setup resources loaded"))', path],
      cwd: directory,
    })
    Tests.expect(result).toBe('Setup resources loaded')
  }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
})
