import { S, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Repo, Tests } from '@shared/os'

Tests.test('fresh setup finds package tools installed after the launcher prepares PATH', async () => {
  await FileSystem.mkdir(Artifacts.resolvePath('tmp'), { recursive: true })
  const root = await Artifacts.mkdtemp(Artifacts.resolvePath('tmp/cli-environment-'))
  await Try(async () => {
    await FileSystem.mkdir(Path.join(root, 'ts/1-grammar'), { recursive: true })
    await FileSystem.writeFile(Path.join(root, 'ts/1-grammar/package.json'), '{}', 'utf8')
    const tool = Path.join(root, 'fixture-tool')
    await FileSystem.writeFile(tool, '#!/bin/sh\n', 'utf8')
    await FileSystem.chmod(tool, 0o755)
    const path = await Platform.capture('sh', {
      variadicArgs: [
        '-c',
        S`
          DEVENV_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
          export DEVENV_ROOT TAO_DEVENV=1
          . "$1"
          mkdir -p "$repository/ts/1-grammar/node_modules/.bin"
          cp "$2" "$repository/ts/1-grammar/node_modules/.bin/tao-fixture-tool"
          command -v tao-fixture-tool
        `,
        Path.join(root, 'agent'),
        Repo.resolvePath('.config/cli-environment.sh'),
        tool,
      ],
    })
    Tests.expect(path).toBe(Path.join(root, 'ts/1-grammar/node_modules/.bin/tao-fixture-tool'))
  }, {
    finally: () => FileSystem.rm(root, { recursive: true, force: true }),
  })
})
