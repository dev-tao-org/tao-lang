import { NewlineCharacter } from '@shared'
import * as Tests from '@shared-tests'
import { FS, Path, Repo } from '@shared/os'
import { prepareSidecarPipeline } from '../workspace-src/SidecarPipeline'
import { createTypeScriptDefaults } from '../workspace-src/sidecars/ManagedModule/ManagedModuleMetadata'
import * as Fixtures from './SidecarPipeline.test-fixtures'

Tests.test('sidecar validation pins runtime types and invalidates cached contracts across generations', async () =>
  await Fixtures.withFixture(async fixture => {
    const first = await writeRuntimeGeneration(fixture.directory, 'first', 'string')
    const second = await writeRuntimeGeneration(fixture.directory, 'second', 'number')
    const defaultsPath = Path.join(fixture.directory, 'snapshot-defaults.json')
    await FS.writeFile(defaultsPath, createTypeScriptDefaults(first))
    await FS.writeFile(
      Path.join(fixture.moduleRoot, 'FormattedDate.tsx'),
      [
        "import { read } from '@tao/runtime-api'",
        'export function FormattedDate(props: { Value: string }) { read(props.Value); return null }',
      ].join(NewlineCharacter),
    )
    const options = {
      ...fixture,
      typescriptDefaultsPath: defaultsPath,
      nodeModulesDirectory: Repo.resolvePath('ts/7-runtime/node_modules'),
      executor: Fixtures.executeTypeScript,
    }
    const original = await prepareSidecarPipeline(options)
    const cached = await prepareSidecarPipeline(options)
    Tests.expect(cached.fingerprint).toBe(original.fingerprint)
    await FS.writeFile(defaultsPath, createTypeScriptDefaults(second))
    await Tests.expect(prepareSidecarPipeline(options)).rejects.toThrow('does not satisfy its declared props contract')
  }))

async function writeRuntimeGeneration(root: string, name: string, inputType: string): Promise<string> {
  const directory = Path.join(root, name)
  await FS.mkdirs(Path.join(directory, 'runtime'), Path.join(directory, 'shared'))
  await FS.writeFile(Path.join(directory, 'shared/shared.ts'), 'export {}')
  const declaration = `export declare function read(value: ${inputType}): void`
  await FS.writeFile(Path.join(directory, 'runtime/TaoRuntimeAPI.ts'), declaration)
  return directory
}
