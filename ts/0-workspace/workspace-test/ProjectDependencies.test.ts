import * as AST from '@ast-gen/AST'
import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import * as Stdlib from '@stdlib/Stdlib'
import type { SourceModule } from '@typecheck/Modules'
import { createProjectDependencyOptions } from '../workspace-src/dependencies/Options'
import { prepareDependencies } from '../workspace-src/dependencies/Store'
import type { DependencyRequirement, DependencyStoreOptions } from '../workspace-src/dependencies/Types'
import { ProjectDependencies } from '../workspace-src/ProjectDependencies'

const BundledTaoAliasErrorRegx = /alias tao belongs to the bundled Tao project/
const MissingDurableLockErrorRegx = /missing; restore the exact durable lock/
const DependencySetupRequiredErrorRegx = /needs setup/
const DependencyDeclarationChangedErrorRegx = /Dependency declarations changed/

type ObservedSourceField = 'path' | 'document'
type ObservedSource = Pick<SourceModule, ObservedSourceField>

Tests.test('the standard project is implicit, locked, and observed like other bundled projects', async () => {
  const root = Artifacts.resolvePath('tmp', `implicit-standard-project-${Platform.randomUUID()}`)
  await Try(async () => {
    await createProject(root)
    const options = await createProjectDependencyOptions(root)
    const requirements = await options.readRequirements(root)
    Tests.expect(requirements).toEqual([{ provider: 'bundled', identifier: 'tao', version: 'bundled' }])
    const lock = await prepareDependencies(root, requirements, options)
    const standardProject = await Stdlib.projectDirectory()
    Tests.expect(lock.sources['bundled:tao']?.location).toBe(standardProject)
    const dependencies = new ProjectDependencies(root, options)
    await dependencies.refresh()
    Tests.expect(await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'tao'))
      .toEqual({ root: standardProject })
    Tests.expect(dependencies.sourceDirectories()).toContain(standardProject)
    await FileSystem.writeFile(Path.join(root, 'Dependencies.tao'), 'requires file:../unrelated as tao')
    await Tests.rejects(options.readRequirements(root), BundledTaoAliasErrorRegx)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('active dependency graphs require restart when authored requirements change', async () => {
  const root = Artifacts.resolvePath('tmp', `project-dependencies-${Platform.randomUUID()}`)
  const first = Path.join(root, 'first')
  const second = Path.join(root, 'second')
  let requirements: DependencyRequirement[] = [fileRequirement('./first')]
  const options: DependencyStoreOptions = {
    readRequirements: async path => Path.resolve(path) === Path.resolve(root) ? requirements : [],
    git: {
      async resolveCommit() {
        throw new Error('unexpected Git resolution')
      },
      async fetchCommit() {
        throw new Error('unexpected Git fetch')
      },
    },
  }
  await Try(async () => {
    await createProject(root)
    await createProject(first)
    await createProject(second)
    await prepareDependencies(root, requirements, options)
    const dependencies = new ProjectDependencies(root, options)
    await dependencies.refresh()
    await dependencies.refresh()
    await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'local')
    Tests.expect(dependencies.sourceDirectories()).toEqual([first])

    requirements = [fileRequirement('./second')]
    Tests.expect(() => dependencies.observeProjectSources(root, parsed(root, requirements)))
      .toThrow(DependencyDeclarationChangedErrorRegx)
    Tests.expect(dependencies.sourceDirectories()).toEqual([first])
    Tests.expect(await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'local')).toEqual({ root: first })

    requirements = [fileRequirement('./first')]
    dependencies.observeProjectSources(root, parsed(root, requirements))
    Tests.expect(dependencies.sourceDirectories()).toEqual([first])
    await FileSystem.rm(Path.join(root, '.tao/store/dependencies.lock.json'))
    await Tests.rejects(dependencies.refresh(), MissingDurableLockErrorRegx)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('same repository aliases at different refs resolve from their individual durable root pins', async () => {
  const root = Artifacts.resolvePath('tmp', `project-dependency-alias-pins-${Platform.randomUUID()}`)
  const requirements: DependencyRequirement[] = [
    { provider: 'github', identifier: 'example/shared', version: 'v1', alias: 'first' },
    { provider: 'github', identifier: 'example/shared', version: 'v2', alias: 'second' },
  ]
  const options: DependencyStoreOptions = {
    readRequirements: async path => Path.resolve(path) === Path.resolve(root) ? requirements : [],
    git: {
      resolveCommit: async () => 'a'.repeat(40),
      async fetchCommit(_repository, _commit, destination) {
        await FileSystem.mkdir(Path.join(destination, '.tao'))
      },
    },
  }
  await Try(async () => {
    await createProject(root)
    await prepareDependencies(root, requirements, options)
    const dependencies = new ProjectDependencies(root, options)
    await dependencies.refresh()
    Tests.expect(await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'first'))
      .toEqual(await dependencies.resolveProject(Path.join(root, 'Main.tao'), 'second'))
    requirements[1] = { ...requirements[1]!, version: 'v3' }
    await Tests.rejects(
      dependencies.resolveProject(Path.join(root, 'Main.tao'), 'second'),
      DependencySetupRequiredErrorRegx,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

function fileRequirement(identifier: string): DependencyRequirement {
  return { provider: 'file', identifier, version: 'live', alias: 'local' }
}

function parsed(root: string, requirements: DependencyRequirement[]): ObservedSource[] {
  const sourcePath = Path.join(root, 'Main.tao')
  const declarations = requirements.map(requirementDeclaration)
  return [{
    path: sourcePath,
    document: {
      root: {
        kind: 'File',
        start: 0,
        end: 0,
        block: {
          kind: 'Block',
          start: 0,
          end: 0,
          statements: declarations,
        },
      },
    },
  }]
}

function requirementDeclaration(requirement: DependencyRequirement): AST.RequiresDeclaration {
  const alias = requirement.alias
  return {
    kind: 'RequiresDeclaration',
    start: 0,
    end: 0,
    provider: requirement.provider,
    identifier: requirement.identifier,
    version: requirement.version,
    alias: alias === undefined ? undefined : { kind: 'Name', start: 0, end: 0, value: alias },
  }
}

async function createProject(path: string): Promise<void> {
  await FileSystem.mkdir(Path.join(path, '.tao'))
}
