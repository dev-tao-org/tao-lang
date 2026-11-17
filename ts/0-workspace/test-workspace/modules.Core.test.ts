import { Json } from '@shared'
import { NewlineCharacter, S, Try } from '@shared'
import * as Tests from '@shared-tests'
import { Artifacts, FS, Path, Platform } from '@shared/os'
import { createWorkspace } from '../workspace-src/Workspace'

type OptionalCompiledContents = Readonly<Record<string, string>> | undefined

Tests.test('recompilation reloads changed dependencies and recovers from invalid source', async () => {
  const directory = Artifacts.resolvePath('tmp', `module-watch-${Platform.randomUUID()}`)
  const dependency = Path.join(directory, '@cards/Card.tao')
  const entry = Path.join(directory, 'feature/App.tao')
  const publications: Readonly<Record<string, string>>[] = []
  const workspace = createWorkspace({
    async publish(app) {
      publications.push(app.files)
    },
  })
  await Try(async () => {
    await writeFixture(directory, dependency)
    Tests.expect((await workspace.files.compileFile(entry)).status).toBe('published')
    Tests.expect(compiledContents(publications.at(-1))).toContain('"First value"')
    await FS.writeFile(dependency, 'package view Card {')
    Tests.expect((await workspace.files.compileFile(entry)).status).toBe('failed')
    Tests.expect(publications).toHaveLength(1)
    await FS.writeFile(dependency, card('Repaired value'))
    Tests.expect((await workspace.files.compileFile(entry)).status).toBe('published')
    Tests.expect(publications).toHaveLength(2)
    Tests.expect(compiledContents(publications.at(-1))).toContain('"Repaired value"')
  }, {
    async finally() {
      await workspace.dispose()
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
})

Tests.test('root requirement observation never links unrelated root declarations into a nested entry', async () => {
  const directory = Artifacts.resolvePath('tmp', `root-observation-${Platform.randomUUID()}`)
  const publications: Readonly<Record<string, string>>[] = []
  const observed: string[] = []
  const workspace = createWorkspace({
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
    await FS.writeFile(
      rootFile,
      S`
        view Hidden {}
        app Other { root Hidden }
      `,
    )
    const result = await workspace.files.compileFile(Path.join(directory, 'feature/App.tao'))
    Tests.expect(result.status).toBe('published')
    Tests.expect(observed).toContain(rootFile)
    Tests.expect(compiledContents(publications[0])).not.toContain('Hidden')
    await FS.writeFile(rootFile, 'view Hidden { requires npm:react version 19.2.3 }')
    const invalid = await workspace.files.compileFile(Path.join(directory, 'feature/App.tao'))
    Tests.expect(invalid.status).toBe('failed')
    Tests.expect(invalid.status === 'failed' && invalid.error).toContain('Requirements belong at file scope.')
  }, {
    async finally() {
      await workspace.dispose()
      await FS.rm(directory, { recursive: true, force: true })
    },
  })
})

async function writeFixture(directory: string, dependency: string): Promise<void> {
  await FS.mkdirs(Path.join(directory, '.tao'), Path.dirname(dependency), Path.join(directory, 'feature'))
  await FS.writeFile(dependency, card('First value'))
  await FS.writeFile(
    Path.join(directory, 'feature/App.tao'),
    S`
      use @cards Card
      app Main { root Card }
    `,
  )
}
function card(value: string): string {
  return S`
    use tao@ui Text
    package view Card { render Text(${Json.Print(value)}) }
  `
}

function compiledContents(files: OptionalCompiledContents): string {
  return Object.values(files ?? {}).join(NewlineCharacter)
}
