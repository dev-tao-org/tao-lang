import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { locateProject, projectDirectory } from '../stdlib-src/Stdlib'

Tests.test('stdlib uses the initialized source project directly', async () => {
  const live = await projectDirectory()
  Tests.expect(await FileSystem.exists(Path.join(live, '.tao', 'store', 'project.json'))).toBe(true)
  Tests.expect(await FileSystem.exists(Path.join(live, '@ui', 'Views.tao'))).toBe(true)
})

Tests.test('packaged stdlib materializes embedded source and project metadata atomically', async () => {
  const root = Artifacts.resolvePath('tmp', `stdlib-project-${Platform.randomUUID()}`)
  const cache = Path.join(root, 'cache')
  const resources = {
    '@ui/Views.tao': 'public view Text { }\n',
    '.tao/.gitignore': 'cache/\nlocks/\n',
    '.tao/store/project.json': '{"version":1,"id":"fixture"}\n',
  }
  await Try(async () => {
    const first = await locateProject(undefined, cache, resources, async operation => await operation())
    const second = await locateProject(undefined, cache, resources, async operation => await operation())
    Tests.expect(first).toBe(second)
    Tests.expect(await FileSystem.readFile(Path.join(first, '@ui', 'Views.tao'), 'utf8')).toBe(
      resources['@ui/Views.tao'],
    )
    Tests.expect(await FileSystem.readFile(Path.join(first, '.tao', 'store', 'project.json'), 'utf8'))
      .toBe(resources['.tao/store/project.json'])
    Tests.expect(await FileSystem.readFile(Path.join(first, '.ready'), 'utf8')).not.toBe('')
    await FileSystem.writeFile(Path.join(first, '@ui', 'Views.tao'), 'tampered')
    await locateProject(undefined, cache, resources, async operation => await operation())
    Tests.expect(await FileSystem.readFile(Path.join(first, '@ui', 'Views.tao'), 'utf8')).toBe(
      resources['@ui/Views.tao'],
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('live project selection takes precedence over embedded cache', async () => {
  const root = Artifacts.resolvePath('tmp', `stdlib-live-project-${Platform.randomUUID()}`)
  const live = Path.join(root, 'live')
  await Try(async () => {
    await FileSystem.mkdir(Path.join(live, '.tao', 'store'), { recursive: true })
    await FileSystem.writeFile(Path.join(live, '.tao', 'store', 'project.json'), '{}')
    const selected = await locateProject(live, Path.join(root, 'cache'), {}, async operation => await operation())
    Tests.expect(selected).toBe(FileSystem.realpathSync(live))
    Tests.expect(await FileSystem.exists(Path.join(root, 'cache'))).toBe(false)
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})

Tests.test('packaged cache refuses a materialization directory symlink escape', async () => {
  const root = Artifacts.resolvePath('tmp', `stdlib-cache-escape-${Platform.randomUUID()}`)
  const cache = Path.join(root, 'cache')
  const outside = Path.join(root, 'outside')
  const resources = { '@ui/Views.tao': 'public view Text { }\n' }
  const entries = Object.entries(resources).sort(([left], [right]) => left.localeCompare(right))
  const target = Path.join(cache, `project-${Platform.hashText(JSON.stringify(entries))}`)
  await Try(async () => {
    await FileSystem.mkdir(cache, { recursive: true })
    await FileSystem.mkdir(outside, { recursive: true })
    await FileSystem.symlink(outside, target)
    await Tests.rejects(
      locateProject(undefined, cache, resources, async operation => await operation()),
      /escapes its cache root/,
    )
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
