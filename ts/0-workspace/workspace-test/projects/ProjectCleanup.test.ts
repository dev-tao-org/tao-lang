import { Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { cleanProject } from '../../workspace-src/projects/Clean'
import { initializeProject } from '../../workspace-src/projects/Projects'

Tests.test('project clean reports malformed module ownership while cleaning safe cache and retaining authored files', async () => {
  const root = Artifacts.resolvePath('tmp', `project-clean-marker-${Platform.randomUUID()}`)
  await Try(async () => {
    await initializeProject(root)
    const module = Path.join(root, '@widgets')
    const marker = Path.join(module, '.tao-managed-module.json')
    const generated = Path.join(root, '.tao/cache/generated')
    await FileSystem.mkdir(module)
    await FileSystem.mkdir(generated, { recursive: true })
    await FileSystem.writeFile(Path.join(generated, 'temporary'), 'disposable')
    await FileSystem.writeFile(marker, '{')
    await FileSystem.writeFile(Path.join(module, 'package.json'), 'authored package contents')
    const result = await cleanProject(root)
    Tests.expect(result.warnings.some(warning => warning.includes(marker) && warning.includes('repair'))).toBe(true)
    Tests.expect(result.sharedProtected).toBe(false)
    Tests.expect(await FileSystem.exists(generated)).toBe(false)
    Tests.expect(await FileSystem.readFile(marker, 'utf8')).toBe('{')
    Tests.expect(await FileSystem.readFile(Path.join(module, 'package.json'), 'utf8')).toBe('authored package contents')
  }, { finally: () => FileSystem.rm(root, { recursive: true, force: true }) })
})
