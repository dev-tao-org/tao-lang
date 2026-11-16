import { NewlineCharacter, S, Try } from '@shared'
import * as Shared from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { readDependencyLock, resolveDependencyLockPath } from '../workspace-src/dependencies/LockFile'
import type { DependencyRequirement, DependencyStoreOptions } from '../workspace-src/dependencies/Types'
import { prepareProject } from '../workspace-src/ProjectPreparation'
import { initializeProject } from '../workspace-src/projects/Projects'

const ConflictingDependencyCommitErrorRegx = /conflicting commits/
const LowercaseNpmAliasErrorRegx = /Declared name 'packageAlias' must start with an uppercase letter\./

Tests.test('automatic preparation rejects reached aliases that resolve one repository to different commits', async () => {
  const root = Artifacts.resolvePath('tmp', `project-preparation-source-conflict-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  const requirements: DependencyRequirement[] = [
    { provider: 'github', identifier: 'example/shared', version: 'v1', alias: 'First' },
    { provider: 'github', identifier: 'example/shared', version: 'v2', alias: 'Second' },
  ]
  const options: DependencyStoreOptions = {
    storeRoot: Path.join(root, 'source-cache'),
    readRequirements: async path => Path.resolve(path) === Path.resolve(root) ? requirements : [],
    git: {
      resolveCommit: async (_repository, version) => version === 'v1' ? 'a'.repeat(40) : 'b'.repeat(40),
      async fetchCommit(_repository, _commit, destination) {
        await FS.mkdirs(Path.join(destination, '.tao'), Path.join(destination, '@ui'))
        await FS.writeFile(
          Path.join(destination, '@ui', 'Widget.tao'),
          'public view Widget { render Text("ok") }' + NewlineCharacter,
        )
      },
    },
  }
  await Try(async () => {
    await initializeProject(root)
    await FS.writeFile(
      entry,
      Shared.joinTextLines(
        S`
          requires github:example/shared version v1 as First
          requires github:example/shared version v2 as Second
          use First@ui Widget
          use Second@ui Widget
          app Main { root Widget }
        `,
        '',
      ),
    )
    await Tests.rejects(prepareProject(entry, { dependencyOptions: options }), ConflictingDependencyCommitErrorRegx)
    const lock = await readDependencyLock(resolveDependencyLockPath(root))
    Tests.expect(lock?.sources['github:example/shared']?.commit).toBe('a'.repeat(40))
    Tests.expect(lock?.roots).toEqual({ First: 'github:example/shared@v1' })
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})

Tests.test('project preparation rejects lowercase npm aliases before installing or recording a lock', async () => {
  const root = Artifacts.resolvePath('tmp', `project-preparation-npm-alias-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  let toolInvocations = 0
  await Try(async () => {
    await initializeProject(root)
    await FS.writeFile(entry, 'requires npm:date-fns version 4.1.0 as packageAlias')
    const lock = resolveDependencyLockPath(root)
    const originalLock = await readDependencyLock(lock)
    const preparation = prepareProject(entry, {
      runtimePins: { react: '0.0.0-tao-fixture' },
      async executor() {
        toolInvocations++
        return { status: 1, stdout: '', stderr: 'Unexpected tool invocation' }
      },
    })
    await Tests.rejects(preparation, LowercaseNpmAliasErrorRegx)
    Tests.expect(toolInvocations).toBe(0)
    Tests.expect(await readDependencyLock(lock)).toEqual(originalLock)
  }, { finally: () => FS.rm(root, { recursive: true, force: true }) })
})
