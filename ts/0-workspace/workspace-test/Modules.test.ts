import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createWorkspace, type UpdateResult } from '../workspace-src/Workspace'
import { createWatchFixture } from './WatchFixture'

type OptionalCompiledContents = Readonly<Record<string, string>> | undefined

Tests.test('dependency changes reload modules and recover invalid source', async () => {
  const directory = Artifacts.resolvePath('tmp', `module-watch-${Platform.randomUUID()}`)
  const dependency = Path.join(directory, '@cards/Card.tao')
  const publications: Readonly<Record<string, string>>[] = []
  const observation = createWatchFixture()
  const workspace = createWorkspace({
    ...observation.options,
    async publish(app) {
      publications.push(app.files)
    },
  })
  await Try(async () => {
    await writeFixture(directory, dependency)
    Tests.expect((await workspace.openFile(Path.join(directory, 'feature/App.tao'))).status).toBe('published')
    Tests.expect(compiledContents(publications.at(-1))).toContain('"First value"')
    Tests.expect((await changeDependency(workspace, observation, dependency, 'project view Card {')).status).toBe(
      'failed',
    )
    Tests.expect(publications).toHaveLength(1)
    Tests.expect((await changeDependency(workspace, observation, dependency, card('Repaired value'))).status).toBe(
      'published',
    )
    Tests.expect(publications).toHaveLength(2)
    Tests.expect(compiledContents(publications.at(-1))).toContain('"Repaired value"')
  }, {
    async finally() {
      await workspace.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
})

Tests.test('root requirement observation never links unrelated root declarations into a nested entry', async () => {
  const directory = Artifacts.resolvePath('tmp', `root-observation-${Platform.randomUUID()}`)
  const publications: Readonly<Record<string, string>>[] = []
  const observed: string[] = []
  const workspace = createWorkspace({
    ...createWatchFixture().options,
    observeProjectSources(_root, sources) {
      observed.push(...sources.map(source => source.path))
    },
    includeModuleRequirements: true,
    async publish(app) {
      publications.push(app.files)
    },
  })
  await Try(async () => {
    await writeFixture(directory, Path.join(directory, '@cards/Card.tao'))
    const rootFile = Path.join(directory, 'Unrelated.tao')
    await FileSystem.writeFile(rootFile, 'view Hidden { render Unknown }\napp Other { root Hidden }')
    const result = await workspace.openFile(Path.join(directory, 'feature/App.tao'))
    Tests.expect(result.status).toBe('published')
    Tests.expect(observed).toContain(rootFile)
    Tests.expect(compiledContents(publications[0])).not.toContain('Hidden')
    Tests.expect(compiledContents(publications[0])).not.toContain('Unknown')
  }, {
    async finally() {
      await workspace.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
})

async function writeFixture(directory: string, dependency: string): Promise<void> {
  await FileSystem.mkdir(Path.join(directory, '.tao'), { recursive: true })
  await FileSystem.mkdir(Path.dirname(dependency), { recursive: true })
  await FileSystem.mkdir(Path.join(directory, 'feature'), { recursive: true })
  await FileSystem.writeFile(dependency, card('First value'))
  await FileSystem.writeFile(
    Path.join(directory, 'feature/App.tao'),
    'use Card from @cards\napp Main { root Card }',
  )
}

function card(value: string): string {
  return `use Text from tao@ui\nproject view Card { render Text(${JSON.stringify(value)}) }`
}

function compiledContents(files: OptionalCompiledContents): string {
  return Object.values(files ?? {}).join('\n')
}

async function changeDependency(
  workspace: ReturnType<typeof createWorkspace>,
  observation: ReturnType<typeof createWatchFixture>,
  path: string,
  source: string,
): Promise<UpdateResult> {
  await FileSystem.writeFile(path, source)
  let complete!: (result: UpdateResult) => void
  const result = new Promise<UpdateResult>(resolve => complete = resolve)
  const stop = workspace.files.onCompiled(event => complete(event.result))
  return await Try(async () => {
    observation.notify(path)
    return await result
  }, { finally: stop })
}
