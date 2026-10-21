import { transform } from '@ast-gen/Transform'
import { createParser } from '@grammar/parser'
import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import {
  readProjectRequirements,
  validateRequirementPlacement,
} from '../../workspace-src/dependencies/Requirements'

Tests.test('project source scanning extracts only project root dependencies and applies defaults', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-requirements-${Platform.randomUUID()}`)
  await Try(async () => {
    await FileSystem.mkdir(Path.join(root, 'nested'), { recursive: true })
    await FileSystem.writeFile(
      Path.join(root, 'Main.tao'),
      [
        'requires github:acme/widgets version v2',
        'requires file:../local',
        'requires bundled:tao',
        'requires npm:date-fns version 4.1.0',
      ].join('\n'),
    )
    await FileSystem.writeFile(Path.join(root, 'nested', 'Module.tao'), 'requires github:acme/other version v1')
    const requirements = await readProjectRequirements(root)
    Tests.expect(requirements).toEqual([
      { provider: 'github', identifier: 'acme/widgets', version: 'v2' },
      { provider: 'file', identifier: '../local', version: 'live' },
      { provider: 'bundled', identifier: 'tao', version: 'bundled' },
    ])
    const nested = transform(
      createParser().parse(await FileSystem.readFile(Path.join(root, 'nested', 'Module.tao'), 'utf8')),
    )!
    await Tests.rejects(
      async () => validateRequirementPlacement(nested.root.declarations, Path.join(root, 'nested', 'Module.tao'), root),
      /project-root Tao files/,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('project source scanning rejects missing GitHub versions and duplicate aliases', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-validation-${Platform.randomUUID()}`)
  const path = Path.join(root, 'Main.tao')
  await Try(async () => {
    await FileSystem.mkdir(root, { recursive: true })
    await FileSystem.writeFile(path, 'requires github:acme/widgets')
    await Tests.rejects(readProjectRequirements(root), /needs a version/)
    await FileSystem.writeFile(
      path,
      [
        'requires github:acme/widgets version v1 as shared',
        'requires github:acme/other version v1 as shared',
      ].join('\n'),
    )
    await Tests.rejects(readProjectRequirements(root), /declared more than once/)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
