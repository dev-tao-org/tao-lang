import { Errors, Try } from '@shared'
import { Artifacts, FileSystem, Path, Platform, Tests } from '@shared/os'
import { withDependencySession } from '../../workspace-src/ModuleDependencies'
import { prepareProject } from '../../workspace-src/ProjectPreparation'
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

Tests.test('project clean protects runtime cache while automatic setup is active and releases after failure', async () => {
  const root = Artifacts.resolvePath('tmp', `project-clean-preparation-${Platform.randomUUID()}`)
  const entry = Path.join(root, 'Main.tao')
  let acknowledgeInstallStarted!: () => void
  let releaseInstall!: () => void
  const installStarted = new Promise<void>(resolve => {
    acknowledgeInstallStarted = resolve
  })
  const installGate = new Promise<void>(resolve => {
    releaseInstall = resolve
  })
  await Try(async () => {
    await initializeProject(root)
    await FileSystem.writeFile(entry, 'view Root { render Text("ok") }\napp Main { root Root }\n')
    const preparing = withDependencySession(root, 'setup', () =>
      prepareProject(entry, {
        runtimeInstaller: {
          async install() {
            acknowledgeInstallStarted()
            await installGate
            Errors.Throw(new Error('controlled installer failure'))
          },
        },
      }))
    await installStarted
    const protectedClean = await cleanProject(root)
    Tests.expect(protectedClean.sharedProtected).toBe(true)
    releaseInstall()
    await Tests.rejects(preparing)
    const cleaned = await cleanProject(root)
    Tests.expect(cleaned.sharedProtected).toBe(false)
    Tests.expect(cleaned.removed).toContain('runtime-toolchains')
  }, {
    async finally() {
      releaseInstall()
      await FileSystem.rm(root, { recursive: true, force: true })
    },
  })
})
