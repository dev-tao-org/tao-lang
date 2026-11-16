import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Repo } from '@shared/os'

import dependencyAdd from '../CLIs-src/dev-cli/commands/dependency-add'

Tests.test('dependency addition requires an exact registry pin and an existing workspace package', async () => {
  await Tests.expect(dependencyAdd.action('CLIs', 'dependency-cruiser@latest', {})).rejects.toThrow('exact version')
  await Tests.expect(dependencyAdd.action('patches', 'dependency-cruiser@18.7.2', {})).rejects.toThrow(
    'declared workspace package directory',
  )
})

Tests.test.skipIf(Path.sep === '\\')(
  'dependency addition sends supported Bun flags in the selected package',
  async () => {
    const directory = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp', 'dependency-add-'))
    await Try(async () => {
      const executable = Path.join(directory, 'bun')
      const output = Path.join(directory, 'command.log')
      const script = S`
        #!/bin/sh
        printf '%s\\n' "$PWD" "$@" > "$TAO_DEPENDENCY_ADD_RECORDING"
      `
      await FS.write(executable, script + NewlineCharacter)
      await FS.chmod(executable, 0o755)
      await Tests.withEnv({ PATH: directory, TAO_DEPENDENCY_ADD_RECORDING: output }, async () => {
        await dependencyAdd.action('CLIs', 'dependency-cruiser@18.7.2', {})
        const production = await FS.file(output).text()
        const expected = [Repo.resolvePath('ts/CLIs'), 'add', '--exact', '--ignore-scripts']
        Tests.expect(production.trimEnd().split(NewlineCharacter)).toEqual([...expected, 'dependency-cruiser@18.7.2'])
        await dependencyAdd.action('CLIs', 'dependency-cruiser@18.7.2', { dev: true })
        const development = await FS.file(output).text()
        Tests.expect(development.trimEnd().split(NewlineCharacter)).toEqual([
          ...expected,
          '--dev',
          'dependency-cruiser@18.7.2',
        ])
      })
    }, { finally: () => FS.rm(directory, { recursive: true, force: true }) })
  },
)
