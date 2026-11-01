import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

Tests.test('setup can load formatter resources before the optional formatter package is installed', async () => {
  const directory = Artifacts.resolvePath('tmp', `formatter-bootstrap-${Platform.randomUUID()}`)
  await FileSystem.mkdir(directory)
  await Try(async () => {
    const path = Path.join(directory, 'FormatterResources.ts')
    await FileSystem.cp(Repo.resolvePath('ts/shared/shared-src/os/FormatterResources.ts'), path)
    const result = await Platform.capture('node --experimental-strip-types -e', {
      variadicArgs: ['import(process.argv[1]).then(() => console.log("Setup resources loaded"))', path],
      cwd: directory,
    })
    Tests.expect(result).toBe('Setup resources loaded')
  }, { finally: () => FileSystem.rm(directory, { recursive: true, force: true }) })
})
