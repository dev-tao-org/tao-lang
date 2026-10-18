import { Time, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { createWorkspace, type UpdateResult } from '../workspace-src/Workspace'

Tests.test('a project watcher reloads package dependencies and recovers invalid source', async () => {
  await Platform.requireHostProcessAccess('Module observation requires macOS host access.')
  const directory = Artifacts.resolvePath('tmp', `module-watch-${Platform.randomUUID()}`)
  const dependency = Path.join(directory, '@cards/Card.tao')
  const publications: string[] = []
  const outcomes: UpdateResult[] = []
  const workspace = createWorkspace({
    async publish(app) {
      publications.push(app.code)
    },
    onSourceUpdate: result => outcomes.push(result),
  })
  await Try(async () => {
    await writeFixture(directory, dependency)
    Tests.expect((await workspace.openFile(Path.join(directory, 'feature/App.tao'))).status).toBe('published')
    Tests.expect(publications.at(-1)).toContain('"First value"')
    await FileSystem.writeFile(dependency, 'project view Card {')
    await waitUntil(() => outcomes.some(result => result.status === 'failed'))
    Tests.expect(publications).toHaveLength(1)
    await FileSystem.writeFile(dependency, card('Repaired value'))
    await waitUntil(() => publications.length === 2)
    Tests.expect(publications.at(-1)).toContain('"Repaired value"')
  }, {
    async finally() {
      await workspace.dispose()
      await FileSystem.rm(directory, { recursive: true, force: true })
    },
  })
}, 10_000)

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
  return `use Text from @tao/ui\nproject view Card { render Text(${JSON.stringify(value)}) }`
}

async function waitUntil(ready: () => boolean): Promise<void> {
  const deadline = Time.nowMs() + 3000
  while (!ready() && Time.nowMs() < deadline) {
    await Time.sleep(5)
  }
  Tests.expect(ready()).toBe(true)
}
