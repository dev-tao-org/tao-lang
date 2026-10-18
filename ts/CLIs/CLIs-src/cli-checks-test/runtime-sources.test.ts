import { RuntimeSourceResources } from '@runtime/RuntimeResources'
import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'
import { writeRuntimeSources } from '../cli-checks/runtime-build'

Tests.test('runtime source resources package captured TypeScript files at relocated paths', async () => {
  const directory = Artifacts.resolvePath('tmp', `runtime-sources-${Platform.randomUUID()}`)
  await Try(() => verifyCapturedResources(directory), {
    finally: () => FileSystem.rm(directory, { recursive: true, force: true }),
  })
})

async function verifyCapturedResources(directory: string): Promise<void> {
  const sources = Object.fromEntries(
    Object.values(RuntimeSourceResources).map(sourcePath => [
      Repo.resolvePath(sourcePath),
      `captured:${sourcePath}`,
    ]),
  )
  await writeRuntimeSources(directory, sources)
  Tests.expect(await FileSystem.readFile(Path.join(directory, 'runtime/TR.ts'), 'utf8'))
    .toBe('captured:ts/7-runtime/runtime-src/TR.ts')
  Tests.expect(await FileSystem.readFile(Path.join(directory, 'runtime/HMRClient.ts'), 'utf8'))
    .toBe('captured:ts/7-runtime/runtime-src/HMRClient.ts')
  Tests.expect(await FileSystem.readFile(Path.join(directory, 'shared/os/PreviewPlatform.ts'), 'utf8'))
    .toBe('captured:ts/shared/shared-src/os/PreviewPlatform.ts')
}
