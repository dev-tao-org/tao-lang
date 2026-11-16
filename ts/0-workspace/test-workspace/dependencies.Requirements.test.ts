import * as AST from '@ast-gen'
import * as Grammar from '@grammar'
import * as Tests from '@shared-tests'

import { S, Try } from '@shared'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import * as Requirements from '../workspace-src/dependencies/Requirements'

const ProjectRootRequirementsOnlyErrorRegx = /project-root Tao files/
const MissingVersionErrorRegx = /needs a version/
const DuplicateRequirementErrorRegx = /declared more than once/
const LowercaseAliasErrorRegx = /Declared name 'widgets' must start with an uppercase letter\./

Tests.test('project source scanning extracts only project root dependencies and applies defaults', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-requirements-${Platform.randomUUID()}`)
  await Try(async () => {
    await FS.mkdir(Path.join(root, 'nested'))
    await FS.writeFile(
      Path.join(root, 'Main.tao'),
      S`
        requires github:acme/widgets version v2
        requires file:../local
        requires bundled:tao
        requires npm:date-fns version 4.1.0
      `,
    )
    await FS.writeFile(Path.join(root, 'nested', 'Module.tao'), 'requires github:acme/other version v1')
    const requirements = await Requirements.readProjectRequirements(root)
    Tests.expect(requirements).toEqual([
      { provider: 'github', identifier: 'acme/widgets', version: 'v2' },
      { provider: 'file', identifier: '../local', version: 'live' },
      { provider: 'bundled', identifier: 'tao', version: 'bundled' },
    ])
    const nested = AST.transform(
      Grammar.createParser().parse(await FS.readFile(Path.join(root, 'nested', 'Module.tao'), 'utf8')),
    )!
    await Tests.rejects(
      async () => Requirements.validateRequirementPlacement(nested, Path.join(root, 'nested', 'Module.tao'), root),
      ProjectRootRequirementsOnlyErrorRegx,
    )
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('project source scanning rejects missing versions, duplicate aliases and lowercase aliases', async () => {
  const root = Artifacts.resolvePath('tmp', `dependency-validation-${Platform.randomUUID()}`)
  const path = Path.join(root, 'Main.tao')
  await Try(async () => {
    await FS.mkdir(root)
    await FS.writeFile(path, 'requires github:acme/widgets')
    await Tests.rejects(Requirements.readProjectRequirements(root), MissingVersionErrorRegx)
    await FS.writeFile(
      path,
      S`
        requires github:acme/widgets version v1 as Shared
        requires github:acme/other version v1 as Shared
      `,
    )
    await Tests.rejects(Requirements.readProjectRequirements(root), DuplicateRequirementErrorRegx)
    await FS.writeFile(path, 'requires file:../widgets as widgets')
    await Tests.rejects(Requirements.readProjectRequirements(root), LowercaseAliasErrorRegx)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})
